// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../.sst/platform/config.d.ts" />

export function defineApplicationSecrets() {
    return {
        authSecret: new sst.Secret("AuthSecret"),
        amazonOrderScraperApiToken: new sst.Secret(
            "AmazonOrderScraperApiToken",
            "",
        ),
        googleGenerativeAiApiKey: new sst.Secret(
            "GoogleGenerativeAiApiKey",
            "",
        ),
        openAiApiKey: new sst.Secret("OpenAiApiKey", ""),
        plaidClientId: new sst.Secret("PlaidClientId", ""),
        plaidSecret: new sst.Secret("PlaidSecret", ""),
    };
}
