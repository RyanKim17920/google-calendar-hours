## Visit: [google-calendar-hours.com](http://google-calendar-hours.com/)

[![codecov](https://codecov.io/gh/aronwoost/google-calendar-hours/graph/badge.svg?token=VPzGwVenqp)](https://codecov.io/gh/aronwoost/google-calendar-hours)

After connecting you could see something like this:

![screenshot 2019-01-05 20-10-20](https://user-images.githubusercontent.com/870980/113689951-29475400-96cb-11eb-85e6-3f2f0120d36c.png)

## Run locally

```
npm install
npm dev
```

### Environment variables

Set these in `.env.local` (or in your hosting provider's settings). Both are
inlined at build time.

| Variable                       | Description                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | OAuth 2.0 Web client id from the Google Cloud console (Calendar API enabled).                                                                   |
| `NEXT_PUBLIC_REDIRECT_URI`     | URL Google redirects back to after auth, e.g. `http://localhost:3000`. Must be listed as an authorized redirect URI (and origin) on the client. |

To get the production build you need to

```
npm run build
npx serve@latest out
```

## Tests

```
npm test
```
