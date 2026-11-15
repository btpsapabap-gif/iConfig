# BTP Cloud Foundry authentication

The application is an XSUAA-protected resource server. `/api/health` is the
only unauthenticated endpoint. All UI and API routes require a JWT; deployment
also requires the local `Deploy` scope.

1. Create the service instance: `cf create-service xsuaa application imigrate-e2e-xsuaa -c xs-security.json`
2. Deploy: `cf push`
3. Assign the generated `Viewer` or `Deployer` role collection in the BTP cockpit.

Cloud Foundry supplies bound XSUAA credentials in `VCAP_SERVICES`. Do not put
client secrets, passwords, or tokens in `.env` or source control. Use an SAP
Application Router with an XSUAA route for browser sign-in; direct API callers
must send an `Authorization: Bearer <XSUAA JWT>` header.
