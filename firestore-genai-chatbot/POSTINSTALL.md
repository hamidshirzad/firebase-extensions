## Testing the extension

You can test out the extension right away by following these steps:

1. Go to the [Cloud Firestore dashboard](https://console.firebase.google.com/project/_/firestore) in the Firebase console.
2. If it doesn't already exist, create the collection you specified during installation: **${param:COLLECTION_NAME}**.
3. Add a document with a **${param:PROMPT_FIELD}** field containing your first message:

```
${param:PROMPT_FIELD}: "How are you today?"
```

4. In a few seconds, you'll see a ${param:ORDER_FIELD} field and then a status field should appear in the document. The status field will update as the extension processes the message.
5. When processing is finished, the ${param:RESPONSE_FIELD} field of the document should be populated with the response from the Google AI Gemini API.

```javascript
const ref = await admin
    .firestore()
    .collection("${param:COLLECTION_NAME}")
    .add({
        ${param:PROMPT_FIELD}: "How are you today?",
    })

ref.onSnapshot(snap => {
    if (snap.get('${param:RESPONSE_FIELD}')) console.log(
        'RESPONSE:' +
        snap.get('${param:RESPONSE_FIELD}')
    )
})
```

## About the providers

The extension gives you a choice of what provider to use for the available models:

- Google AI: For more details on this Gemini API, see the [Gemini homepage](https://ai.google.dev/docs).

## About the models

The extension gives you a choice of 2 models:

- [Gemini Pro](https://ai.google.dev/models/gemini) chat model

## Handling errors

If the extension encounters an error, it will write an error message to the document in `status` field. You can use this field to monitor for errors in your documents. Currently some errors will instruct you to visit the Cloud Function logs for the extension, to avoid exposing sensitive information.

## Monitoring

As a best practice, you can [monitor the activity](https://firebase.google.com/docs/extensions/manage-installed-extensions#monitor) of your installed extension, including checks on its health, usage, and logs.
