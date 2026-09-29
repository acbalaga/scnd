# Feedback form

The app shows a "Give feedback" link in the footer when `FEEDBACK_URL` in `public/js/app.js` is set to your Google Form's public link. Until it is set the link is hidden.

## Set it up

1. Create the form in Google Forms. In **Settings**, leave "Collect email addresses" off unless you need to reply.
2. Click **Send**, choose the link tab, copy the link (it starts with `https://forms.gle/` or `https://docs.google.com/forms/`).
3. Paste it as the value of `FEEDBACK_URL` in `public/js/app.js`, commit, and push. (Or send the link here and I will do it.)

The link opens the form in a new tab. Nothing from the app is sent to Google: the app does not pass any of the owner's numbers to the form. The footer tells people not to type bill numbers or personal details into it. Google's form collects whatever people type, so treat the answers as personal data.

## Suggested questions

Keep it to about six. Short forms get answered.

1. Did you get to an answer (a PR dial with a plain sentence)? Yes / No / Nearly
2. How long did it take from opening the page to your first answer? Under 5 minutes / 5 to 10 / More than 10
3. Which box or word did you get stuck on? (short answer)
4. Did the bill decoder change what you understood about your export credit? Yes / No / Not sure
5. Would you print or send the findings sheet to your installer? Yes / Maybe / No, and why? (short answer)
6. Your system type: on-grid / hybrid. Your utility (for example Meralco, VECO, DLPC): (short answer)
