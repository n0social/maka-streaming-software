# Known errors

## Stream title, description, and preview never reach YouTube

Seen on the 2.8.1 client. A YouTube broadcast came up as “Skyler Davila Live Stream” with the channel profile image as the preview. The title, description, and game art entered in Go Live were not on the watch page.

Maka stores `streamTitle`, `streamCategory`, and `streamDescription` and posts them on `POST /config`. The unpacked v0.1.0 relay does not apply those fields. Publishing is RTMP with the stream key only. There is no YouTube Data API client and no account sign-in, so nothing calls `liveBroadcasts.update` or `thumbnails.set`. YouTube then names the broadcast “{channel name} Live Stream” and uses the channel image.

The Go Live thumbnail is local game art from `assets/games/`. It is not uploaded.

Work later: a YouTube connection that can set the broadcast title, description, and thumbnail. Do not treat an RTMP metadata write as a fix. YouTube ignores that for the watch page.

### Twitch is not the same field, and Maka does not update it either

Twitch can change the live title and the game from a third-party app. That is one Helix `PATCH /channels` call with a user token: `title` and `game_id`. Twitch has no broadcast description like YouTube. The comment in `src/shared/relay-config.ts` already skips a description unless YouTube is the target.

Maka does not make that Helix call. The Twitch requests in the app are public viewer-count reads. A title that changes on Twitch was set in Twitch (dashboard or the channel page), not by this app. The same stored title is posted to the relay for both platforms, and the relay drops it for both.
