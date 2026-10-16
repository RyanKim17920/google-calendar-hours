import { encode } from 'qss';
import dayjs from 'dayjs';

import { saveAuthError } from './storage';

const API_BASE_PATH = 'https://www.googleapis.com/calendar/v3/';

// Google error bodies look like
// { error: { code, message, status, errors: [{ reason }], details: [{ reason }] } }
// `errors[].reason` is the legacy code (e.g. accessNotConfigured), `details`
// carries the newer one (e.g. SERVICE_DISABLED), `status` is the generic one.
const readGoogleError = async (response) => {
  let error;
  try {
    ({ error } = await response.json());
  } catch (e) {
    // not JSON, fall through to the HTTP status
  }

  return {
    reason:
      error?.errors?.[0]?.reason ??
      error?.details?.find((detail) => detail.reason)?.reason ??
      error?.status ??
      null,
    message: error?.message ?? `Google API responded with ${response.status}`,
  };
};

const fetchGoogle = async ({ url, accessToken, params }) => {
  const response = await fetch(
    `${url}?${encode({
      access_token: accessToken,
      ...params,
    })}`
  );

  if (response.status !== 200) {
    // 401 means the token expired: silently go back to the auth screen. Any
    // other failure won't fix itself by re-authorizing blindly, so keep
    // Google's reason for the auth screen to explain.
    if (response.status !== 401) {
      saveAuthError(await readGoogleError(response));
    }
    sessionStorage.removeItem('accessToken');
    window.location = '/';
    return Promise.reject();
  }
  return response.json();
};

export const fetchCalendars = ({ accessToken }) =>
  fetchGoogle({ url: `${API_BASE_PATH}users/me/calendarList`, accessToken });

const fetchEvents = async ({ accessToken, calendarId, pageToken, acc }) => {
  const { items, nextPageToken } = await fetchGoogle({
    url: `${API_BASE_PATH}calendars/${encodeURIComponent(calendarId)}/events`,
    accessToken,
    params: {
      singleEvents: true,
      maxResults: 2500,
      pageToken,
      timeMax: dayjs().add(2, 'year').toJSON(),
    },
  });

  if (!nextPageToken) {
    return [...acc, ...items];
  }

  return fetchEvents({
    accessToken,
    calendarId,
    pageToken: nextPageToken,
    acc: [...acc, ...items],
  });
};

export const fetchCalendarEvents = ({ accessToken, calendarId }) =>
  fetchEvents({ accessToken, calendarId, acc: [] });
