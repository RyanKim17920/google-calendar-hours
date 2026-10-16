'use client';

import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { decode } from 'qss';
import cx from 'classnames';

import { selectHasToken } from './stores/authentication';
import { selectView } from './stores/viewState';
import { VIEW } from './constants';

import AuthScreen from './AuthScreen';
import Interface from './Interface';

import styles from './App.module.css';

const App = () => {
  const hasToken = useSelector(selectHasToken);
  const isPlanner = useSelector(selectView) === VIEW.PLANNER;
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    const hashParams = decode(window.location?.hash?.slice(1) ?? '');

    if (hashParams.access_token) {
      sessionStorage.setItem('accessToken', hashParams.access_token);
      window.location = '/';
    }
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
            {(!isClient || !hasToken) && <AuthScreen />}
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
