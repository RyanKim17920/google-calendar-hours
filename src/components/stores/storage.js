export const updateConfig = (rest) => {
  let existingConfig;
  try {
    existingConfig = JSON.parse(window.localStorage.getItem('config'));
  } catch (err) {
    // don't handle
  }

  const updatedConfig = {
    ...existingConfig,
    ...rest,
  };

  window.localStorage.setItem('config', JSON.stringify(updatedConfig));
};

export const getConfig = () => {
  try {
    return JSON.parse(window.localStorage.getItem('config'));
  } catch (err) {
    // don't handle
  }
  return null;
};

// The auth error survives the redirect back to `/` (a full page load), so it
// lives in sessionStorage next to the access token. It is cleared when a new
// token arrives or the user starts a new authorization.
const AUTH_ERROR_KEY = 'authError';

export const saveAuthError = ({ reason, message }) => {
  try {
    window.sessionStorage.setItem(
      AUTH_ERROR_KEY,
      JSON.stringify({ reason, message })
    );
  } catch (err) {
    // don't handle
  }
};

export const getAuthError = () => {
  try {
    return JSON.parse(window.sessionStorage.getItem(AUTH_ERROR_KEY));
  } catch (err) {
    // don't handle
  }
  return null;
};

export const clearAuthError = () => {
  try {
    window.sessionStorage.removeItem(AUTH_ERROR_KEY);
  } catch (err) {
    // don't handle
  }
};
