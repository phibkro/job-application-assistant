import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

const OWNER = "phibkro";
const REPOSITORY = "job-application-assistant";
const ENVIRONMENT = "pr-preview";

/**
 * Bootstrap stack for the narrowly scoped credential used by PR previews.
 *
 * Deploy this stack locally with the privileged `admin` profile. The minted
 * account-owned token can manage the Worker and D1 resources, plus the
 * Cloudflare-hosted Alchemy state store that makes deploy/update/destroy
 * converge across ephemeral GitHub runners. Its plaintext value flows
 * directly into the protected GitHub environment and is never printed.
 */
export default Alchemy.Stack(
  "JobIndexGitHub",
  {
    providers: Cloudflare.providers().pipe(
      Layer.provideMerge(GitHub.providers()),
    ),
    // This bootstrap stack is run only from the operator workstation. Keeping
    // its state local avoids coupling credential rotation to the shared
    // Cloudflare state-store Worker.
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const { accountId } = yield* Cloudflare.CloudflareEnvironment;

    const apiToken = yield* Cloudflare.AccountApiToken(
      "PrPreviewToken",
      {
        name: "job-index-pr-preview",
        accountId,
        policies: [
          {
            effect: "allow",
            permissionGroups: [
              "Workers Scripts Write",
              "D1 Write",
              "Account Settings Write",
              "Secrets Store Write",
              "Workers Tail Read",
              "Workers Observability Read",
            ],
            resources: {
              [`com.cloudflare.api.account.${accountId}`]: "*",
            },
          },
        ],
      },
    );

    yield* GitHub.Secret("PrPreviewApiToken", {
      owner: OWNER,
      repository: REPOSITORY,
      environment: ENVIRONMENT,
      name: "CLOUDFLARE_API_TOKEN",
      value: apiToken.value,
    });

    yield* GitHub.Secret("PrPreviewAccountId", {
      owner: OWNER,
      repository: REPOSITORY,
      environment: ENVIRONMENT,
      name: "CLOUDFLARE_ACCOUNT_ID",
      value: Redacted.make(accountId),
    });
  }),
);
