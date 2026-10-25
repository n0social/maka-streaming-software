import type { TabcastBridge } from '../preload/index'

const FEEDBACK_SUPPORT_MAIL =
  'mailto:n0social@skydav.work?subject=Maka%20feedback'

export function initFeedbackPanel(tabcast: TabcastBridge): void {
  const optIn = document.getElementById('studio-diagnostics-opt-in') as HTMLInputElement | null
  const btnOpen = document.getElementById('btn-studio-feedback') as HTMLButtonElement | null
  const dialog = document.getElementById('feedback-dialog') as HTMLDialogElement | null
  const form = document.getElementById('feedback-form') as HTMLFormElement | null
  const messageEl = document.getElementById('feedback-message') as HTMLTextAreaElement | null
  const emailEl = document.getElementById('feedback-email') as HTMLInputElement | null
  const statusEl = document.getElementById('feedback-status') as HTMLParagraphElement | null
  const linkPrivacy = document.getElementById('feedback-privacy-link') as HTMLAnchorElement | null

  if (!optIn || !btnOpen || !dialog || !form || !messageEl || !emailEl || !statusEl) return

  if (linkPrivacy) {
    linkPrivacy.href = 'https://github.com/n0social/maka-streaming-software/blob/main/docs/privacy-and-feedback.md'
  }

  void tabcast.getSettings().then((s) => {
    optIn.checked = s.diagnosticsOptIn === true
  })

  optIn.addEventListener('change', () => {
    void tabcast.setSettings({ diagnosticsOptIn: optIn.checked })
  })

  btnOpen.addEventListener('click', () => {
    statusEl.textContent = ''
    messageEl.value = ''
    emailEl.value = ''
    dialog.showModal()
    messageEl.focus()
  })

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null
    if (submitter?.value === 'cancel') {
      dialog.close()
      return
    }
    const message = messageEl.value.trim()
    if (!message) {
      statusEl.textContent = 'Please enter a message.'
      return
    }
    const email = emailEl.value.trim()
    statusEl.textContent = 'Saving…'
    void tabcast
      .submitFeedback({ message, email: email || undefined })
      .then(async (res) => {
        if (!res.ok) {
          statusEl.textContent = res.error ?? 'Could not save feedback.'
          return
        }
        try {
          await navigator.clipboard.writeText(res.clipboardText)
        } catch {
          // clipboard may be blocked; log path still valid
        }
        statusEl.textContent =
          'Saved locally. Support text copied to clipboard — paste into GitHub or email. We do not send email from the app.'
        messageEl.value = ''
        emailEl.value = ''
      })
      .catch(() => {
        statusEl.textContent = 'Could not save feedback.'
      })
  })

  const btnEmail = document.getElementById('feedback-open-email') as HTMLButtonElement | null
  btnEmail?.addEventListener('click', () => {
    void tabcast.openExternal(FEEDBACK_SUPPORT_MAIL)
  })

  const btnGithub = document.getElementById('feedback-open-github') as HTMLButtonElement | null
  btnGithub?.addEventListener('click', () => {
    void tabcast.openExternal(
      'https://github.com/n0social/maka-streaming-software/issues/new?labels=feedback&title=Maka%20feedback',
    )
  })
}
