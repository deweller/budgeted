// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../.sst/platform/config.d.ts" />

export function defineApplicationSecrets() {
    return {
        authSecret: new sst.Secret("AuthSecret"),
        amazonOrderScraperApiToken: new sst.Secret(
            "AmazonOrderScraperApiToken",
        ),
        amazonOrderScraperApiUrl: new sst.Secret("AmazonOrderScraperApiUrl"),
        googleGenerativeAiApiKey: new sst.Secret("GoogleGenerativeAiApiKey"),
        openAiApiKey: new sst.Secret("OpenAiApiKey"),
        plaidClientId: new sst.Secret("PlaidClientId"),
        plaidEnv: new sst.Secret("PlaidEnv"),
        plaidSecret: new sst.Secret("PlaidSecret"),
    };
}
