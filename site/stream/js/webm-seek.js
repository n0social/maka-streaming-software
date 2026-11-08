/**
 * MediaRecorder WebM blobs omit a real duration and cue index, so players
 * lock the scrubber. This rewrites the Info duration and appends Cues so the
 * saved file can be seeked.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MakaWebmSeek = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var ID_SEGMENT = 0x18538067;
  var ID_INFO = 0x1549a966;
  var ID_TIMECODE_SCALE = 0x2ad7b1;
  var ID_DURATION = 0x4489;
  var ID_CLUSTER = 0x1f43b675;
  var ID_TIMECODE = 0xe7;
  var ID_CUES = 0x1c53bb6b;

  function readId(data, pos) {
    if (pos >= data.length) return null;
    var first = data[pos];
    var len = 0;
    if (first & 0x80) len = 1;
    else if (first & 0x40) len = 2;
    else if (first & 0x20) len = 3;
    else if (first & 0x10) len = 4;
    else return null;
    if (pos + len > data.length) return null;
    var id = 0;
    for (var i = 0; i < len; i++) id = id * 256 + data[pos + i];
    return { id: id, len: len };
  }

  function readSize(data, pos) {
    if (pos >= data.length) return null;
    var first = data[pos];
    var len = 1;
    var mask = 0x80;
    while (len <= 8 && (first & mask) === 0) {
      mask >>= 1;
      len++;
    }
    if (len > 8 || pos + len > data.length) return null;
    var value = first & (mask - 1);
    var unknown = value === mask - 1;
    for (var i = 1; i < len; i++) {
      var b = data[pos + i];
      if (b !== 0xff) unknown = false;
      value = value * 256 + b;
    }
    return { value: value, len: len, unknown: unknown };
  }

  function walk(data, start, end, fn) {
    var pos = start;
    while (pos + 2 <= end) {
      var id = readId(data, pos);
      if (!id) break;
      var size = readSize(data, pos + id.len);
      if (!size) break;
      var contentStart = pos + id.len + size.len;
      var contentEnd = size.unknown ? end : contentStart + size.value;
      if (contentEnd > end) break;
      fn({
        id: id.id,
        start: pos,
        idLen: id.len,
        sizeLen: size.len,
        contentStart: contentStart,
        contentEnd: contentEnd,
        unknown: size.unknown,
      });
      if (size.unknown) break;
      if (contentEnd <= pos) break;
      pos = contentEnd;
    }
  }

  function readUint(data, start, end) {
    var value = 0;
    for (var i = start; i < end && i < start + 8; i++) value = value * 256 + data[i];
    return value;
  }

  function concat(chunks) {
    var len = 0;
    var i;
    for (i = 0; i < chunks.length; i++) len += chunks[i].length;
    var out = new Uint8Array(len);
    var offset = 0;
    for (i = 0; i < chunks.length; i++) {
      out.set(chunks[i], offset);
      offset += chunks[i].length;
    }
    return out;
  }

  function encodeSizeFixed(value, len) {
    var max = Math.pow(2, 7 * len) - 2;
    if (value < 0 || value > max) return null;
    var out = new Uint8Array(len);
    var tmp = value;
    for (var i = len - 1; i >= 0; i--) {
      out[i] = tmp & 0xff;
      tmp = Math.floor(tmp / 256);
    }
    out[0] |= 1 << (8 - len);
    return out;
  }

  function encodeSize(value) {
    var len = 1;
    while (len < 8 && encodeSizeFixed(value, len) === null) len++;
    return encodeSizeFixed(value, len);
  }

  function makeElement(idBytes, content) {
    var size = encodeSize(content.length);
    var out = new Uint8Array(idBytes.length + size.length + content.length);
    out.set(idBytes, 0);
    out.set(size, idBytes.length);
    out.set(content, idBytes.length + size.length);
    return out;
  }

  function uintBytes(value) {
    if (value <= 0) return new Uint8Array([0]);
    var bytes = [];
    var tmp = value;
    while (tmp > 0) {
      bytes.push(tmp & 0xff);
      tmp = Math.floor(tmp / 256);
    }
    var out = new Uint8Array(bytes.length);
    for (var i = 0; i < bytes.length; i++) out[i] = bytes[bytes.length - 1 - i];
    return out;
  }

  function uintElement(idBytes, value) {
    return makeElement(idBytes, uintBytes(Math.max(0, Math.round(value))));
  }

  function float64Element(idBytes, value) {
    var data = new Uint8Array(8);
    new DataView(data.buffer).setFloat64(0, value, false);
    return makeElement(idBytes, data);
  }

  function clusterTime(data, cluster) {
    var time = 0;
    walk(data, cluster.contentStart, cluster.contentEnd, function (child) {
      if (child.id === ID_TIMECODE) time = readUint(data, child.contentStart, child.contentEnd);
    });
    return time;
  }

  function rebuildInfo(data, info, durationUnits) {
    var pieces = [];
    walk(data, info.contentStart, info.contentEnd, function (child) {
      if (child.id === ID_DURATION) return;
      pieces.push(data.subarray(child.start, child.contentEnd));
    });
    pieces.push(float64Element([0x44, 0x89], durationUnits));
    return makeElement([0x15, 0x49, 0xa9, 0x66], concat(pieces));
  }

  function buildCues(clusters) {
    var points = [];
    for (var i = 0; i < clusters.length; i++) {
      var trackPos = concat([
        uintElement([0xf7], 1),
        uintElement([0xf1], clusters[i].position),
      ]);
      var body = concat([uintElement([0xb3], clusters[i].time), makeElement([0xb7], trackPos)]);
      points.push(makeElement([0xbb], body));
    }
    return makeElement([0x1c, 0x53, 0xbb, 0x6b], concat(points));
  }

  function rewriteSegmentHeader(header, idLen, sizeLen, unknown, payloadLen) {
    if (unknown) return header;
    var size = encodeSizeFixed(payloadLen, sizeLen);
    if (!size) size = encodeSize(payloadLen);
    if (!size) return header;
    var out = new Uint8Array(idLen + size.length);
    out.set(header.subarray(0, idLen), 0);
    out.set(size, idLen);
    return out;
  }

  /**
   * @param {Uint8Array} input
   * @param {number} durationMs wall-clock length of the recording
   * @returns {Uint8Array}
   */
  function fixWebmBuffer(input, durationMs) {
    var data = input instanceof Uint8Array ? input : new Uint8Array(input);
    var top = [];
    walk(data, 0, data.length, function (el) {
      top.push(el);
    });
    var segment = null;
    for (var i = 0; i < top.length; i++) {
      if (top[i].id === ID_SEGMENT) segment = top[i];
    }
    if (!segment) return data;

    var children = [];
    walk(data, segment.contentStart, segment.contentEnd, function (el) {
      children.push(el);
    });
    var info = null;
    for (var c = 0; c < children.length; c++) {
      if (children[c].id === ID_INFO) info = children[c];
    }
    if (!info) return data;

    var scale = 1000000;
    walk(data, info.contentStart, info.contentEnd, function (el) {
      if (el.id === ID_TIMECODE_SCALE) {
        var next = readUint(data, el.contentStart, el.contentEnd);
        if (next) scale = next;
      }
    });

    var lastClusterTime = 0;
    var sawCluster = false;
    for (c = 0; c < children.length; c++) {
      if (children[c].id !== ID_CLUSTER) continue;
      sawCluster = true;
      var time = clusterTime(data, children[c]);
      if (time > lastClusterTime) lastClusterTime = time;
    }

    var unitsFromClock = durationMs > 0 ? (durationMs * 1e6) / scale : 0;
    var unitsFromClusters = sawCluster ? lastClusterTime + (1000 * 1e6) / scale : 0;
    var durationUnits = Math.max(unitsFromClock, unitsFromClusters);
    if (!durationUnits) return data;

    var newInfo = rebuildInfo(data, info, durationUnits);
    var payloadParts = [];
    var clusters = [];
    var payloadLen = 0;
    for (c = 0; c < children.length; c++) {
      var el = children[c];
      if (el.id === ID_CUES) continue;
      var bytes = el.id === ID_INFO ? newInfo : data.subarray(el.start, el.contentEnd);
      if (el.id === ID_CLUSTER) {
        clusters.push({ time: clusterTime(data, el), position: payloadLen });
      }
      payloadParts.push(bytes);
      payloadLen += bytes.length;
    }
    if (clusters.length) {
      var cues = buildCues(clusters);
      payloadParts.push(cues);
      payloadLen += cues.length;
    }

    var segmentHeader = rewriteSegmentHeader(
      data.subarray(segment.start, segment.contentStart),
      segment.idLen,
      segment.sizeLen,
      segment.unknown,
      payloadLen,
    );
    var before = data.subarray(0, segment.start);
    var after =
      segment.contentEnd < data.length ? data.subarray(segment.contentEnd) : new Uint8Array(0);
    return concat([before, segmentHeader, concat(payloadParts), after]);
  }

  return { fixWebmBuffer: fixWebmBuffer };
});
