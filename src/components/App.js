'use client';

import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import cx from 'classnames';

import { selectAuthError, selectHasToken } from './stores/authentication';
import { clearAuthError, saveAuthError } from './stores/storage';
import { selectView } from './stores/viewState';
import { VIEW } from './constants';

import AuthScreen from './AuthScreen';
import Interface from './Interface';

import styles from './App.module.css';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

// Google's implicit OAuth flow returns
// `#access_token=...&token_type=Bearer&expires_in=3599&scope=...` on success
// and `#error=access_denied` when the user declines. With granular consent the
// user can untick the calendar checkbox, so the granted `scope` (space
// separated) has to be checked before the token is any use.
const handleOAuthRedirect = (hash) => {
  const hashParams = new URLSearchParams(hash);
  const accessToken = hashParams.get('access_token');
  const error = hashParams.get('error');

  const rejectAuth = (authError) => {
    saveAuthError(authError);
    sessionStorage.removeItem('accessToken');
    window.location = '/';
  };

  if (error) {
    rejectAuth({
      reason: error,
      message: hashParams.get('error_description') ?? error,
    });
    return;
  }

  if (!accessToken) {
    return;
  }

  const scope = hashParams.get('scope');
  if (scope !== null && !scope.split(/\s+/).includes(CALENDAR_SCOPE)) {
    rejectAuth({
      reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT',
      message: `Granted scopes: ${scope || 'none'}`,
    });
    return;
  }

  clearAuthError();
  sessionStorage.setItem('accessToken', accessToken);
  window.location = '/';
};

const App = () => {
  const hasToken = useSelector(selectHasToken);
  const authError = useSelector(selectAuthError);
  const isPlanner = useSelector(selectView) === VIEW.PLANNER;
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    handleOAuthRedirect(window.location?.hash?.slice(1) ?? '');
  }, []);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <div className={styles.appWrapper}>
      <div
        className={cx(styles.app, {
          // The month grid needs more room than the narrow hours column.
          [styles.appWide]: isClient && hasToken && isPlanner,
        })}
      >
        <div className={styles.sticky}>
          <div className={styles.content}>
            <h1 className={styles.headline}>
              Google Calendar Hours Calculator
            </h1>
            {(!isClient || !hasToken) && (
              // The error comes from sessionStorage, which the server render
              // can't see, so only show it after hydration.
              <AuthScreen error={isClient ? authError : null} />
            )}
            {isClient && hasToken && <Interface />}
          </div>
          <footer className={styles.footer}>
            <p>
              <span>© 2011 - 2024. This app is open source. </span>
              <a
                href="https://github.com/aronwoost/google-calendar-hours"
                target="_blank"
                rel="noreferrer"
              >
                Check it on GitHub
              </a>
              <span>.</span>
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default App;
