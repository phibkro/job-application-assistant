# Configure NAV feed authentication

NAV's vacancy feed accepts a signed bearer JWT on every request. There are two supported operating modes.

## Runtime public mode

When `NAV_API_TOKEN` is absent, the Worker fetches NAV's rotating public token
from `/api/publicToken` at runtime. The token is parsed and cached per Worker
isolate, so local setup does not copy a public token into `.dev.vars`, bundles,
or deployment state.

## Registered-consumer mode

NAV asks production consumers to accept the API terms and request registration at `nav.team.arbeidsplassen@nav.no`. Provide:

- organization or company identifier;
- contact email;
- contact telephone number;
- contact person.

After NAV issues the private bearer token, configure it without placing it in shell history:

```sh
just nav-key
```

The command:

1. reads the token through a hidden prompt, or from `NAV_PRIVATE_API_TOKEN` for automation;
2. accepts either a plain JWT or NAV's `Authorization: Bearer …` representation;
3. decodes non-secret token metadata and rejects an expired JWT;
4. performs an authenticated request to the current feed tail;
5. writes ignored `.dev.vars` with mode `0600`;
6. records the explicit private mode in `NAV_TOKEN_SOURCE`.

NAV's implementation allows a private token to omit the expiry claim. Such a token remains authoritative until NAV revokes or replaces it.

## Deploy the private key

A normal verified deployment automatically uploads a locally configured private key:

```sh
./deploy
```

To rotate the key on an already deployed Worker without a complete application deployment:

```sh
just nav-key-cloudflare
```

This requires a successful prior deployment and updates the `NAV_API_TOKEN` Worker secret. The secret value is passed to Wrangler over standard input and is not written to deployment logs.

## Non-interactive configuration

```sh
NAV_PRIVATE_API_TOKEN="$TOKEN" just nav-key
```

Do not place the literal token in committed files, command examples, CI logs, or issue reports. Use the CI platform's secret store when automating this command.

## Runtime selection

At runtime the Worker resolves credentials as follows:

1. a non-empty Cloudflare `NAV_API_TOKEN` secret selects private mode;
2. when the secret is absent, the Worker fetches NAV's current public token
   from `/api/publicToken`;
3. a missing or malformed private token fails the request and never falls back
   to the public endpoint.
