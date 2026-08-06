# Configure NAV feed authentication

NAV's vacancy feed accepts a signed bearer JWT on every request. There are two supported operating modes.

## Experiment mode

Refresh NAV's rotating public token into ignored local Wrangler state:

```sh
just nav-token
```

`just setup` performs the same refresh opportunistically when no private key is configured. The public key is suitable for development and can rotate without notice. Running `just nav-token` explicitly switches the local configuration back to experiment mode.

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
6. marks the credential `NAV_TOKEN_SOURCE=private` so setup never replaces it.

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

## Fallback behavior

At runtime the Worker resolves credentials in this order:

1. Cloudflare `NAV_API_TOKEN` secret;
2. NAV's current public experiment token when `NAV_USE_PUBLIC_TOKEN=true`;
3. fail the synchronization attempt without advancing the source cursor.
