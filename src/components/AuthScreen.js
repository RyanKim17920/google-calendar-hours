import { Fragment } from 'react';
import { encode } from 'qss';

import { clearAuthError } from './stores/storage';

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const googleScope =
  'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events.readonly';

const getGoogleAuthUrl = () => {
  const params = encode({
    client_id: googleClientId,
    redirect_uri: process.env.NEXT_PUBLIC_REDIRECT_URI,
    scope: googleScope,
    response_type: 'token',
  });

  return `https://accounts.google.com/o/oauth2/auth?${params}`;
};

const ENABLE_API_HINT =
  'Enable the Google Calendar API in your Google Cloud project (APIs & Services → Library → Google Calendar API), wait a minute, then retry.';
const SCOPE_HINT =
  "Tick the calendar permission checkboxes on Google's consent screen, then retry.";

// Google reports the same problem with a legacy reason (errors[].reason) or a
// newer one (details[].reason); map both to one actionable hint.
const HINTS = {
  accessNotConfigured: ENABLE_API_HINT,
  SERVICE_DISABLED: ENABLE_API_HINT,
  insufficientPermissions: SCOPE_HINT,
  ACCESS_TOKEN_SCOPE_INSUFFICIENT: SCOPE_HINT,
  access_denied:
    "Access was denied on Google's consent screen. Authorize again and allow calendar access.",
};

// eslint-disable-next-line react/prop-types
const AuthError = ({ error: { reason, message } }) => {
  const hint = HINTS[reason];

  return (
    <div className="alert alert-danger" role="alert" data-testid="AuthError">
      <p className="mb-0">{hint ?? message}</p>
      {hint && message && (
        <p className="mb-0 mt-2 small">Google said: {message}</p>
      )}
    </div>
  );
};

// eslint-disable-next-line react/prop-types
const AuthScreen = ({ error = null }) => (
  <Fragment>
    {error && <AuthError error={error} />}
    <p>
      This web app lets you see how many hours you spend on a Google Calendar.
      It uses the Google Calendar API to fetch your calendars and events,
      crunches the data and displays it nicely. You can filter by day, week,
      month, year, total or add a custom time range.
    </p>

    <p>You need to authorize the app with the following link:</p>
    <a
      href={getGoogleAuthUrl()}
      onClick={clearAuthError}
      data-testid="AuthLink"
    >
      <img
        src="./google_auth.png"
        alt="Auth with Google"
        width="191"
        height="46"
      />
    </a>
    <h3>Privacy Policy</h3>
    <p>
      This app connects to the Google Calendar API to fetch your calendars and
      events, so that it can calculate the hours. This connection happens
      directly from your browser to the Google API. There are no server or
      services involved that might cache the data.
    </p>
    <p>
      None of the data fetched from the Google Calendar API is saved elsewhere
      but in your browser. After you close the browser window/tab all
      authentication data is delete (technical detail: sessionStorage is used).
      Thats why you need to reauthorize with Google the next time you visit the
      page.
    </p>
    <p>This app only has read-only access to your calendar data.</p>
  </Fragment>
);

export default AuthScreen;
