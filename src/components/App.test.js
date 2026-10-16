import {
  screen,
  render,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import { Provider } from 'react-redux';
import timekeeper from 'timekeeper';
import { http, delay } from 'msw';
import { setupServer } from 'msw/node';

import store from './stores';
import App from './App';

jest.mock('./utils/createBlobUrl', () => (content) => content);

const mockCalendarResponse = jest.fn();
const mockEventsResponse = jest.fn();

const testEvents = [
  {
    start: { dateTime: '2016-01-01T10:00:00Z' },
    end: { dateTime: '2016-01-01T11:00:00Z' },
  },
  {
    start: { dateTime: '2018-01-02T10:00:00Z' },
    end: { dateTime: '2018-01-02T11:00:00Z' },
  },
];

const renderApp = () =>
  render(
    <Provider store={store()}>
      <App />
    </Provider>
  );

beforeEach(() => {
  timekeeper.freeze(new Date('2018-01-01T10:00:00Z'));
  window.localStorage.setItem(
    'config',
    JSON.stringify({
      selectedCalendarId: 'test-id',
    })
  );

  window.sessionStorage.setItem('accessToken', 'ABC123');
  mockCalendarResponse.mockReturnValue([
    { id: 'test-id', summary: 'test-name' },
  ]);
  mockEventsResponse.mockReturnValue(testEvents);
});

const server = setupServer(
  http.get(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    ({ request }) => {
      const url = new URL(request.url);
      const accessToken = url.searchParams.get('access_token');

      return new Response(JSON.stringify({ items: mockCalendarResponse() }), {
        headers: {
          'Content-Type': 'application/json',
        },
        status: accessToken === 'return-403' ? 403 : 200,
      });
    }
  ),
  http.get(
    'https://www.googleapis.com/calendar/v3/calendars/:calendarId/events',
    async ({ request }) => {
      const url = new URL(request.url);
      const accessToken = url.searchParams.get('access_token');
      const pageToken = url.searchParams.get('pageToken');

      if (accessToken === 'eventsWithDelay') {
        await delay(1000);
      }

      if (accessToken === 'withNextPageToken') {
        if (!pageToken) {
          // first request (w/o pageToken)
          return new Response(
            JSON.stringify({
              items: testEvents,
              nextPageToken: 'nextPageToken',
            }),
            {
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );
        }

        // second request (with pageToken)
        return new Response(JSON.stringify({ items: testEvents }), {
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }

      return new Response(JSON.stringify({ items: mockEventsResponse() }), {
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  )
);

delete window.location;

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it('renders auth screen', () => {
  window.location = {
    origin: 'http://test.com',
    pathname: '/testpath',
  };

  window.sessionStorage.removeItem('accessToken');

  renderApp();

  expect(
    screen.getByText('Google Calendar Hours Calculator')
  ).toBeInTheDocument();
  expect(screen.getByTestId('AuthLink')).toHaveAttribute(
    'href',
    'https://accounts.google.com/o/oauth2/auth?client_id=test-client-id&redirect_uri=http%3A%2F%2Ftest.com&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.readonly%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.events.readonly&response_type=token'
  );
  expect(screen.getByAltText('Auth with Google')).toBeInTheDocument();
  expect(
    screen.getByText('© 2011 - 2024. This app is open source.')
  ).toBeInTheDocument();
  expect(screen.getByText('Check it on GitHub')).toBeInTheDocument();
});

it('writes access token to sessionStorage and does redirect', () => {
  window.location = new URL(
    'https://www.example.com/hello#access_token=ABC123&foo=bar'
  );

  renderApp();

  expect(window.sessionStorage.getItem('accessToken')).toEqual('ABC123');
  expect(window.location).toBe('/');
});

it('delete access token from sessionStorage and does redirect when API returns non-200', async () => {
  window.sessionStorage.setItem('accessToken', 'return-403');

  renderApp();

  await waitFor(() =>
    expect(window.sessionStorage.getItem('accessToken')).toEqual(null)
  );

  expect(window.location).toBe('/');
});

it('renders "loading" without calendars', () => {
  renderApp();

  expect(screen.getByText('loading')).toBeInTheDocument();
});

it('renders without UI elements when calendars are loading but viewState values are set', async () => {
  window.localStorage.setItem(
    'config',
    JSON.stringify({
      selectedCalendarId: 'test-id',
      selectedRangeType: 'week',
    })
  );
  window.sessionStorage.setItem('accessToken', 'eventsWithDelay');

  renderApp();

  expect(await screen.findByTestId('CalendarsList')).toBeInTheDocument();

  expect(screen.queryByTestId('RangeSelectList')).not.toBeInTheDocument();
  expect(screen.queryByTestId('RangeChanger')).not.toBeInTheDocument();
  expect(screen.queryByText('Week starts on:')).not.toBeInTheDocument();
  expect(screen.queryByTestId('RangeDisplay')).not.toBeInTheDocument();
});

it('renders "loading" when events are loading', async () => {
  window.sessionStorage.setItem('accessToken', 'eventsWithDelay');

  renderApp();

  fireEvent.change(await screen.findByTestId('CalendarsList'), {
    target: { value: 'test-id' },
  });

  expect(screen.getByText('loading')).toBeInTheDocument();
});

it('renders static content', () => {
  renderApp();

  expect(
    screen.getByText('Google Calendar Hours Calculator')
  ).toBeInTheDocument();
  expect(
    screen.getByText('© 2011 - 2024. This app is open source.')
  ).toBeInTheDocument();
  expect(screen.getByText('Check it on GitHub')).toBeInTheDocument();
});

it('renders calendars list', () => {
  renderApp();

  expect(screen.queryByText('Please select calendar')).not.toBeInTheDocument();
});

it('requests calendars and display placeholder', async () => {
  window.localStorage.removeItem('config');

  renderApp();

  expect(await screen.findByText('Please select calendar')).toBeInTheDocument();
  expect(await screen.findByText('test-name')).toBeInTheDocument();
  expect(screen.queryByTestId('RangeSelectList')).not.toBeInTheDocument();
  expect(screen.queryByText('Loading hours')).not.toBeInTheDocument();
  expect(screen.queryByTestId('RangeChanger')).not.toBeInTheDocument();
});

it('renders default state (happy path)', async () => {
  renderApp();

  expect(await screen.findByText('Total')).toBeInTheDocument();
  expect(screen.getByText('Week')).toBeInTheDocument();
  expect(screen.getByText('1h')).toBeInTheDocument();
});

it('renders hours rounded', async () => {
  mockEventsResponse.mockReturnValue([
    {
      start: { dateTime: '2018-01-02T09:00:00Z' },
      end: { dateTime: '2018-01-02T09:05:00Z' },
    },
  ]);

  renderApp();

  expect(await screen.findByText('0.08h')).toBeInTheDocument();
});

it('renders hours for events that start/end exactly at selected start/end date', async () => {
  mockEventsResponse.mockReturnValue([
    {
      start: { dateTime: '2017-12-31T23:00:00Z' },
      end: { dateTime: '2018-01-01T00:00:00Z' },
    },
    {
      start: { dateTime: '2018-01-31T22:00:00Z' },
      end: { dateTime: '2018-01-31T23:00:00Z' },
    },
  ]);

  renderApp();

  expect(await screen.findByText('2h')).toBeInTheDocument();
});

it('renders hours with overnight events', async () => {
  mockEventsResponse.mockReturnValue([
    {
      start: { dateTime: '2017-12-31T22:00:00Z' },
      end: { dateTime: '2018-01-01T00:00:00Z' },
    },
    {
      start: { dateTime: '2018-01-31T22:00:00Z' },
      end: { dateTime: '2018-02-01T00:00:00Z' },
    },
  ]);

  renderApp();

  expect(await screen.findByText('2h')).toBeInTheDocument();
});

it('renders correctly after user changes calendar', async () => {
  mockCalendarResponse.mockReturnValue([
    { id: 'test-id', label: 'test-name' },
    { id: 'test-id-2', label: 'test-name-2' },
  ]);
  mockEventsResponse.mockReturnValue(testEvents);

  renderApp();

  fireEvent.change(await screen.findByTestId('CalendarsList'), {
    target: { value: 'test-id-2' },
  });

  expect(await screen.findByText('1h')).toBeInTheDocument();
});

it('requests events, display hours and sets localStorage when loaded', async () => {
  renderApp();

  fireEvent.change(await screen.findByTestId('CalendarsList'), {
    target: { value: 'test-id' },
  });

  expect(await screen.findByText('1h')).toBeInTheDocument();

  expect(window.localStorage.getItem('config')).toEqual(
    '{"selectedCalendarId":"test-id"}'
  );
});

it('makes multiple event requests (when response contains nextPageToken)', async () => {
  window.sessionStorage.setItem('accessToken', 'withNextPageToken');
  renderApp();

  fireEvent.change(await screen.findByTestId('CalendarsList'), {
    target: { value: 'test-id' },
  });

  expect(await screen.findByText('2h')).toBeInTheDocument();
});

describe('localStorage', () => {
  it('saves user selection', async () => {
    renderApp();

    fireEvent.change(await screen.findByTestId('CalendarsList'), {
      target: { value: 'test-id' },
    });

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'week' },
    });

    fireEvent.click(screen.getByLabelText('Sunday'));

    expect(window.localStorage.getItem('config')).toEqual(
      '{"selectedCalendarId":"test-id","selectedRangeType":"week","weekStart":"sunday"}'
    );
  });

  it('saves start and end when user changes from week to custom', async () => {
    renderApp();

    fireEvent.change(await screen.findByTestId('CalendarsList'), {
      target: { value: 'test-id' },
    });

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'week' },
    });

    fireEvent.change(screen.getByTestId('RangeSelectList'), {
      target: { value: 'custom' },
    });

    expect(window.localStorage.getItem('config')).toEqual(
      '{"selectedCalendarId":"test-id","selectedRangeType":"custom","start":"2017-12-31T23:00:00.000Z","end":"2018-01-06T23:00:00.000Z"}'
    );
  });

  it('saves custom start and end', async () => {
    const { container } = renderApp();

    fireEvent.change(await screen.findByTestId('CalendarsList'), {
      target: { value: 'test-id' },
    });

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'custom' },
    });

    const dateInputs = container.querySelectorAll(
      '[data-testid="CustomRange"] input'
    );

    fireEvent.change(dateInputs[0], {
      target: { value: '2004-01-01' },
    });

    fireEvent.change(dateInputs[1], {
      target: { value: '2018-02-02' },
    });

    expect(window.localStorage.getItem('config')).toEqual(
      '{"selectedCalendarId":"test-id","start":"2003-12-31T23:00:00.000Z","end":"2018-02-01T23:00:00.000Z","selectedRangeType":"custom"}'
    );
  });

  it('reads data', async () => {
    timekeeper.freeze(new Date('2018-01-08T13:00:00Z'));
    window.localStorage.setItem(
      'config',
      JSON.stringify({
        selectedCalendarId: 'test-id',
        selectedRangeType: 'week',
        weekStart: 'sunday',
      })
    );

    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2018-01-07T10:00:00Z' },
        end: { dateTime: '2018-01-07T11:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-08T13:00:00Z' },
        end: { dateTime: '2018-01-08T14:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-09T10:00:00Z' },
        end: { dateTime: '2018-01-09T11:00:00Z' },
      },
    ]);

    renderApp();

    // without {weekStart: 'sunday'} result would be 2h
    expect(await screen.findByText('3h')).toBeInTheDocument();
  });

  it('reads data with custom range', async () => {
    window.localStorage.setItem(
      'config',
      JSON.stringify({
        selectedCalendarId: 'test-id',
        selectedRangeType: 'custom',
        start: '2004-01-01T10:00:00.000Z',
        end: '2018-02-02T10:00:00.000Z',
      })
    );

    renderApp();

    expect(await screen.findByText('2h')).toBeInTheDocument();
  });

  it('clears selectedCalendarId when id is not part of the server response', async () => {
    window.localStorage.setItem(
      'config',
      JSON.stringify({
        selectedCalendarId: 'not-existing-calendar-id',
      })
    );

    renderApp();

    expect(
      await screen.findByText('Please select calendar')
    ).toBeInTheDocument();

    expect(window.localStorage.getItem('config')).toEqual(
      '{"selectedCalendarId":null}'
    );
  });
});

describe('calculate hours', () => {
  it('renders 0h hours (if not matching events)', async () => {
    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2018-01-20T10:00:00Z' },
        end: { dateTime: '2018-01-20T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'week' },
    });

    expect(screen.getByText('0h')).toBeInTheDocument();

    expect(screen.queryByText('show details')).not.toBeInTheDocument();
  });

  it('renders hours for day', async () => {
    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T11:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-01T13:00:00Z' },
        end: { dateTime: '2018-01-01T14:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-10T10:00:00Z' },
        end: { dateTime: '2018-01-10T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'day' },
    });

    expect(screen.getByText('2h')).toBeInTheDocument();

    expect(screen.queryByText('Week starts on:')).not.toBeInTheDocument();
    expect(screen.queryByTestId('CustomRange')).not.toBeInTheDocument();
  });

  it('renders hours for day when user changes to previous day', async () => {
    timekeeper.freeze(new Date('2018-01-02T10:00:00Z'));

    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T11:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-01T13:00:00Z' },
        end: { dateTime: '2018-01-01T14:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-02T10:00:00Z' },
        end: { dateTime: '2018-01-02T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'day' },
    });

    fireEvent.click(screen.getByText('Prev'));

    expect(screen.getByText('2h')).toBeInTheDocument();
  });

  it('renders hours for day when user changes to next day', async () => {
    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T11:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-01T13:00:00Z' },
        end: { dateTime: '2018-01-01T14:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-02T10:00:00Z' },
        end: { dateTime: '2018-01-02T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'day' },
    });

    fireEvent.click(screen.getByText('Next'));

    expect(screen.getByText('1h')).toBeInTheDocument();
  });

  it('renders hours for day when user resets', async () => {
    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T11:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-01T13:00:00Z' },
        end: { dateTime: '2018-01-01T14:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-02T10:00:00Z' },
        end: { dateTime: '2018-01-02T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'day' },
    });

    fireEvent.click(screen.getByText('Next'));

    fireEvent.click(screen.getByText('Reset'));

    expect(screen.getByText('2h')).toBeInTheDocument();
  });

  it('renders hours for week', async () => {
    timekeeper.freeze(new Date('2018-01-08T13:00:00Z'));

    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2018-01-07T10:00:00Z' },
        end: { dateTime: '2018-01-07T11:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-08T13:00:00Z' },
        end: { dateTime: '2018-01-08T14:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-09T10:00:00Z' },
        end: { dateTime: '2018-01-09T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'week' },
    });

    expect(screen.getByText('2h')).toBeInTheDocument();

    expect(screen.getByText('Week starts on:')).toBeInTheDocument();
    expect(screen.getByText('Sunday')).toBeInTheDocument();
    expect(screen.getByText('Monday')).toBeInTheDocument();

    expect(screen.queryByTestId('CustomRange')).not.toBeInTheDocument();
  });

  it('renders hours for week when user changes to previous week', async () => {
    timekeeper.freeze(new Date('2018-01-12T10:00:00Z'));

    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T11:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-01T13:00:00Z' },
        end: { dateTime: '2018-01-01T14:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-12T10:00:00Z' },
        end: { dateTime: '2018-01-12T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'week' },
    });

    fireEvent.click(screen.getByText('Prev'));

    expect(screen.getByText('2h')).toBeInTheDocument();
  });

  it('renders hours for week when user changes to next week', async () => {
    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T11:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-01T13:00:00Z' },
        end: { dateTime: '2018-01-01T14:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-12T10:00:00Z' },
        end: { dateTime: '2018-01-12T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'week' },
    });

    fireEvent.click(screen.getByText('Next'));

    expect(screen.getByText('1h')).toBeInTheDocument();
  });

  it('renders hours for week when user resets', async () => {
    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T11:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-01T13:00:00Z' },
        end: { dateTime: '2018-01-01T14:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-12T10:00:00Z' },
        end: { dateTime: '2018-01-12T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'week' },
    });

    fireEvent.click(screen.getByText('Next'));

    fireEvent.click(screen.getByText('Reset'));

    expect(screen.getByText('2h')).toBeInTheDocument();
  });

  it('renders hours for week when user sets week start to Sunday', async () => {
    timekeeper.freeze(new Date('2018-01-08T13:00:00Z'));

    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2018-01-07T10:00:00Z' },
        end: { dateTime: '2018-01-07T11:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-08T13:00:00Z' },
        end: { dateTime: '2018-01-08T14:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-09T10:00:00Z' },
        end: { dateTime: '2018-01-09T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'week' },
    });

    fireEvent.click(screen.getByLabelText('Sunday'));

    // without "Sunday" result would be 2h
    expect(screen.getByText('3h')).toBeInTheDocument();
  });

  it('renders hours for month', async () => {
    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T11:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-14T13:00:00Z' },
        end: { dateTime: '2018-01-14T14:00:00Z' },
      },
      {
        start: { dateTime: '2018-02-01T10:00:00Z' },
        end: { dateTime: '2018-02-01T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'month' },
    });

    expect(screen.getByText('2h')).toBeInTheDocument();

    expect(screen.queryByText('Week starts on:')).not.toBeInTheDocument();
    expect(screen.queryByTestId('CustomRange')).not.toBeInTheDocument();
  });

  it('renders hours for month when user changes to previous month', async () => {
    timekeeper.freeze(new Date('2018-02-01T10:00:00Z'));

    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T11:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-01T13:00:00Z' },
        end: { dateTime: '2018-01-01T14:00:00Z' },
      },
      {
        start: { dateTime: '2018-02-01T10:00:00Z' },
        end: { dateTime: '2018-02-01T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'month' },
    });

    fireEvent.click(screen.getByText('Prev'));

    expect(screen.getByText('2h')).toBeInTheDocument();
  });

  it('renders hours for month when user changes to next month', async () => {
    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T11:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-01T13:00:00Z' },
        end: { dateTime: '2018-01-01T14:00:00Z' },
      },
      {
        start: { dateTime: '2018-02-01T10:00:00Z' },
        end: { dateTime: '2018-02-01T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'month' },
    });

    fireEvent.click(screen.getByText('Next'));

    expect(screen.getByText('1h')).toBeInTheDocument();
  });

  it('renders hours for month when user resets', async () => {
    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T11:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-01T13:00:00Z' },
        end: { dateTime: '2018-01-01T14:00:00Z' },
      },
      {
        start: { dateTime: '2018-02-01T10:00:00Z' },
        end: { dateTime: '2018-02-01T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'month' },
    });

    fireEvent.click(screen.getByText('Next'));

    fireEvent.click(screen.getByText('Reset'));

    expect(screen.getByText('2h')).toBeInTheDocument();
  });

  it('renders hours for year', async () => {
    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2017-01-01T10:00:00Z' },
        end: { dateTime: '2017-01-01T11:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-14T13:00:00Z' },
        end: { dateTime: '2018-01-14T14:00:00Z' },
      },
      {
        start: { dateTime: '2018-02-01T10:00:00Z' },
        end: { dateTime: '2018-02-01T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'year' },
    });

    expect(screen.getByText('2h')).toBeInTheDocument();

    expect(screen.queryByText('Week starts on:')).not.toBeInTheDocument();
    expect(screen.queryByTestId('CustomRange')).not.toBeInTheDocument();
  });

  it('renders hours for year when user changes to previous year', async () => {
    timekeeper.freeze(new Date('2019-01-01T10:00:00Z'));

    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T11:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-01T13:00:00Z' },
        end: { dateTime: '2018-01-01T14:00:00Z' },
      },
      {
        start: { dateTime: '2019-01-01T10:00:00Z' },
        end: { dateTime: '2019-01-01T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'year' },
    });

    fireEvent.click(screen.getByText('Prev'));

    expect(screen.getByText('2h')).toBeInTheDocument();
  });

  it('renders hours for year when user changes to next year', async () => {
    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T11:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-01T13:00:00Z' },
        end: { dateTime: '2018-01-01T14:00:00Z' },
      },
      {
        start: { dateTime: '2019-01-01T10:00:00Z' },
        end: { dateTime: '2019-01-01T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'year' },
    });

    fireEvent.click(screen.getByText('Next'));

    expect(screen.getByText('1h')).toBeInTheDocument();
  });

  it('renders hours for year when user resets', async () => {
    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T11:00:00Z' },
      },
      {
        start: { dateTime: '2018-01-01T13:00:00Z' },
        end: { dateTime: '2018-01-01T14:00:00Z' },
      },
      {
        start: { dateTime: '2019-01-01T10:00:00Z' },
        end: { dateTime: '2019-01-01T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'year' },
    });

    fireEvent.click(screen.getByText('Next'));

    fireEvent.click(screen.getByText('Reset'));

    expect(screen.getByText('2h')).toBeInTheDocument();
  });

  it('renders hours for total', async () => {
    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2004-01-01T10:00:00Z' },
        end: { dateTime: '2004-01-01T11:00:00Z' },
      },
      {
        start: { dateTime: '2010-01-14T13:00:00Z' },
        end: { dateTime: '2010-01-14T14:00:00Z' },
      },
      {
        start: { dateTime: '2018-02-01T10:00:00Z' },
        end: { dateTime: '2018-02-01T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'total' },
    });

    expect(screen.getByText('3h')).toBeInTheDocument();

    expect(screen.queryByTestId('RangeChanger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('CustomRange')).not.toBeInTheDocument();
  });

  it('renders hours for custom', async () => {
    // set to a tuesday
    timekeeper.freeze(new Date('2004-01-01T10:00:00Z'));

    mockEventsResponse.mockReturnValue([
      {
        start: { dateTime: '2004-01-01T10:00:00Z' },
        end: { dateTime: '2004-01-01T11:00:00Z' },
      },
      {
        start: { dateTime: '2010-01-14T13:00:00Z' },
        end: { dateTime: '2010-01-14T14:00:00Z' },
      },
      {
        start: { dateTime: '2018-02-02T10:00:00Z' },
        end: { dateTime: '2018-02-02T11:00:00Z' },
      },
    ]);

    const { container } = renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'week' },
    });

    fireEvent.change(screen.getByTestId('RangeSelectList'), {
      target: { value: 'custom' },
    });

    const dateInputs = container.querySelectorAll(
      '[data-testid="CustomRange"] input'
    );

    // inputs should have the value of previously selected range ("week" in this case)
    expect(dateInputs[0].value).toBe('2003-12-29');
    expect(dateInputs[1].value).toBe('2004-01-04');

    fireEvent.change(dateInputs[0], {
      target: { value: '2004-01-01' },
    });

    fireEvent.change(dateInputs[1], {
      target: { value: '2018-02-02' },
    });

    expect(screen.getByText('3h')).toBeInTheDocument();

    expect(screen.queryByTestId('RangeChanger')).not.toBeInTheDocument();

    // back to week
    fireEvent.change(screen.getByTestId('RangeSelectList'), {
      target: { value: 'week' },
    });

    expect(screen.getByText('1h')).toBeInTheDocument();
  });
});

describe('display time range in human readable format', () => {
  it('renders current day', async () => {
    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'day' },
    });

    expect(screen.getByText('Monday, January 1, 2018')).toBeInTheDocument();
  });

  it('renders current week', async () => {
    // set to a tuesday
    timekeeper.freeze(new Date('2018-01-02T10:00:00Z'));

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'week' },
    });

    expect(screen.getByText('1/1/2018 - 1/7/2018')).toBeInTheDocument();
  });

  it('renders current week with week start sunday', async () => {
    // set to a tuesday
    timekeeper.freeze(new Date('2018-01-02T10:00:00Z'));

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'week' },
    });

    fireEvent.click(screen.getByLabelText('Sunday'));

    expect(screen.getByText('12/31/2017 - 1/6/2018')).toBeInTheDocument();
  });

  it('renders current month', async () => {
    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'month' },
    });

    expect(screen.getByText('January 2018')).toBeInTheDocument();
  });

  it('renders current year', async () => {
    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'year' },
    });

    expect(screen.getByText('2018')).toBeInTheDocument();
  });

  it('renders without RangeDisplay ("total")', async () => {
    renderApp();

    expect(await screen.findByTestId('RangeDisplay')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('RangeSelectList'), {
      target: { value: 'total' },
    });

    expect(screen.queryByTestId('RangeDisplay')).not.toBeInTheDocument();
  });
});

describe('display events', () => {
  it('renders events collapsed', async () => {
    timekeeper.freeze(new Date('2018-01-01T10:00:00Z'));

    mockEventsResponse.mockReturnValue([
      {
        id: '1',
        summary: 'event-1',
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T12:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'month' },
    });

    expect(screen.getByTestId('ShowEventsButton')).toBeInTheDocument();

    expect(screen.queryByText('event-1')).not.toBeInTheDocument();
  });

  it('renders events', async () => {
    timekeeper.freeze(new Date('2018-01-01T10:00:00Z'));

    mockEventsResponse.mockReturnValue([
      {
        id: '1',
        summary: 'event-1',
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T12:00:00Z' },
      },
      {
        id: '2',
        summary: 'event-2',
        start: { dateTime: '2018-01-05T13:00:00Z' },
        end: { dateTime: '2018-01-05T18:00:00Z' },
      },
      {
        id: '3',
        summary: 'event-3',
        start: { dateTime: '2018-02-01T10:00:00Z' },
        end: { dateTime: '2018-02-01T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'month' },
    });

    fireEvent.click(screen.getByTestId('ShowEventsButton'));

    expect(screen.getByTestId('HideEventsButton')).toBeInTheDocument();
    expect(screen.getByText('Sort by:')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();

    expect(screen.getByText('01/01')).toBeInTheDocument();
    expect(
      screen.getByTitle('01/01/2018, 11:00 AM - 01:00 PM')
    ).toBeInTheDocument();
    expect(screen.getByText('event-1')).toBeInTheDocument();
    expect(screen.getByTitle('event-1')).toBeInTheDocument();
    expect(screen.getByText('2h')).toBeInTheDocument();

    expect(screen.getByText('01/05')).toBeInTheDocument();
    expect(
      screen.getByTitle('01/05/2018, 02:00 PM - 07:00 PM')
    ).toBeInTheDocument();
    expect(screen.getByText('event-2')).toBeInTheDocument();
    expect(screen.getByTitle('event-2')).toBeInTheDocument();
    expect(screen.getByText('5h')).toBeInTheDocument();

    expect(screen.getByText('hide details of 2 events')).toBeInTheDocument();

    const downloadLink = screen.getByText('Export as CSV');
    expect(downloadLink).toBeInTheDocument();
    expect(downloadLink).toHaveAttribute(
      'download',
      'test-name_January_2018_(20180101110000).csv'
    );
    expect(downloadLink.getAttribute('href')).toMatchSnapshot();

    expect(screen.queryByText('event-3')).not.toBeInTheDocument();
  });

  it('renders events sorted by date', async () => {
    timekeeper.freeze(new Date('2018-01-01T10:00:00Z'));

    mockEventsResponse.mockReturnValue([
      {
        id: '1',
        summary: 'event-1',
        start: { dateTime: '2018-01-05T10:00:00Z' },
        end: { dateTime: '2018-01-05T12:00:00Z' },
      },
      {
        id: '2',
        summary: 'event-2',
        start: { dateTime: '2018-01-05T09:00:00Z' },
        end: { dateTime: '2018-01-05T09:30:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'month' },
    });

    fireEvent.click(screen.getByTestId('ShowEventsButton'));

    const items = screen.queryAllByText(/event-[1-3]/);

    expect(items).toHaveLength(2);
    // confirm correct order
    expect(items[0]).toHaveTextContent('event-2');
    expect(items[1]).toHaveTextContent('event-1');
  });

  it('renders with rounded hours', async () => {
    timekeeper.freeze(new Date('2018-01-01T10:00:00Z'));

    mockEventsResponse.mockReturnValue([
      {
        id: '1',
        summary: 'event-1',
        start: { dateTime: '2018-01-02T09:00:00Z' },
        end: { dateTime: '2018-01-02T09:05:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'month' },
    });

    fireEvent.click(screen.getByTestId('ShowEventsButton'));

    expect(screen.getAllByText('0.08h')).toHaveLength(2);
  });

  it('renders events by amount', async () => {
    timekeeper.freeze(new Date('2018-01-01T10:00:00Z'));

    mockEventsResponse.mockReturnValue([
      {
        id: '1',
        summary: 'event-1',
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T12:00:00Z' },
      },
      {
        id: '2',
        summary: 'event-2',
        start: { dateTime: '2018-01-05T13:00:00Z' },
        end: { dateTime: '2018-01-05T18:00:00Z' },
      },
      {
        id: '3',
        summary: 'event-3',
        start: { dateTime: '2018-02-01T10:00:00Z' },
        end: { dateTime: '2018-02-01T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'month' },
    });

    fireEvent.click(screen.getByTestId('ShowEventsButton'));

    fireEvent.click(screen.getByLabelText('Amount'));

    expect(screen.queryByText('Export as CSV')).not.toBeInTheDocument();

    const items = screen.queryAllByText(/event-[1-3]/);

    expect(items).toHaveLength(2);
    // confirm correct order
    expect(items[0]).toHaveTextContent('event-2');
    expect(items[1]).toHaveTextContent('event-1');
  });

  it('renders with events with same summary added together', async () => {
    timekeeper.freeze(new Date('2018-01-01T10:00:00Z'));

    mockEventsResponse.mockReturnValue([
      {
        id: '1',
        summary: 'test summary',
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T12:00:00Z' },
      },
      {
        id: '2',
        summary: 'test summary',
        start: { dateTime: '2018-01-05T13:00:00Z' },
        end: { dateTime: '2018-01-05T18:00:00Z' },
      },
      {
        id: '3',
        summary: 'some other event',
        start: { dateTime: '2018-01-06T10:00:00Z' },
        end: { dateTime: '2018-01-06T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'month' },
    });

    fireEvent.click(screen.getByTestId('ShowEventsButton'));
    fireEvent.click(screen.getByLabelText('Amount'));

    expect(screen.getByText('7h')).toBeInTheDocument();
  });

  it('renders added events with correctly rounded', async () => {
    timekeeper.freeze(new Date('2018-01-01T10:00:00Z'));

    mockEventsResponse.mockReturnValue([
      {
        id: '1',
        summary: 'test summary',
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T17:20:00Z' },
      },
      {
        id: '2',
        summary: 'test summary',
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T17:20:00Z' },
      },
      {
        id: '3',
        summary: 'test summary',
        start: { dateTime: '2018-01-01T10:00:00Z' },
        end: { dateTime: '2018-01-01T11:50:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'month' },
    });

    fireEvent.click(screen.getByTestId('ShowEventsButton'));
    fireEvent.click(screen.getByLabelText('Amount'));

    expect(screen.getAllByText('16.5h')).toHaveLength(2);
  });

  it('renders events with correct week background color', async () => {
    timekeeper.freeze(new Date('2022-11-02T10:00:00Z'));

    mockEventsResponse.mockReturnValue([
      {
        id: '1',
        summary: 'event 1',
        start: { dateTime: '2022-11-01T10:00:00Z' },
        end: { dateTime: '2022-11-01T11:00:00Z' },
      },
      {
        id: '8',
        summary: 'event 8',
        start: { dateTime: '2022-11-08T10:00:00Z' },
        end: { dateTime: '2022-11-08T11:00:00Z' },
      },
      {
        id: '15',
        summary: 'event 15',
        start: { dateTime: '2022-11-15T10:00:00Z' },
        end: { dateTime: '2022-11-15T11:00:00Z' },
      },
      {
        id: '2',
        summary: 'event 2',
        start: { dateTime: '2022-11-02T10:00:00Z' },
        end: { dateTime: '2022-11-02T11:00:00Z' },
      },
    ]);

    renderApp();

    fireEvent.change(await screen.findByTestId('RangeSelectList'), {
      target: { value: 'month' },
    });

    fireEvent.click(screen.getByText('show details of 4 events'));

    expect(screen.getByText('11/01').parentNode).toHaveClass('listItemLight');
    expect(screen.getByText('11/02').parentNode).toHaveClass('listItemLight');
    expect(screen.getByText('11/08').parentNode).toHaveClass('listItemDark');
    expect(screen.getByText('11/15').parentNode).toHaveClass('listItemLight');
  });
});

describe('day planner', () => {
  // Frozen "now" is Mon 1 Jan 2018, 11:00 Berlin time.
  const plannerEvents = [
    // Fri 5 Jan 2018, 09:00-12:30 Berlin
    {
      start: { dateTime: '2018-01-05T08:00:00Z' },
      end: { dateTime: '2018-01-05T11:30:00Z' },
    },
    // Wed 10 Jan 2018, 10:00-12:00 Berlin
    {
      start: { dateTime: '2018-01-10T09:00:00Z' },
      end: { dateTime: '2018-01-10T11:00:00Z' },
    },
    // Fri 2 Feb 2018, 10:00-11:00 Berlin
    {
      start: { dateTime: '2018-02-02T09:00:00Z' },
      end: { dateTime: '2018-02-02T10:00:00Z' },
    },
  ];

  const setConfig = (config) =>
    window.localStorage.setItem(
      'config',
      JSON.stringify({ selectedCalendarId: 'test-id', ...config })
    );

  const readConfig = () => JSON.parse(window.localStorage.getItem('config'));

  const renderPlanner = async () => {
    const view = renderApp();
    await screen.findByTestId('MonthPlanner');
    return view;
  };

  const getDay = (day) => document.querySelector(`[data-day="${day}"]`);
  const getTotal = () => screen.getByTestId('SelectionTotal');

  const mockElementFromPoint = (day) => {
    document.elementFromPoint = jest.fn(() => getDay(day));
  };

  const drag = (from, to) => {
    fireEvent.pointerDown(getDay(from));
    mockElementFromPoint(to);
    fireEvent.pointerMove(getDay(from));
  };

  beforeEach(() => {
    mockEventsResponse.mockReturnValue(plannerEvents);
    setConfig({ view: 'planner' });
  });

  afterEach(() => {
    delete document.elementFromPoint;
  });

  it('switches between hours and planner view and persists the choice', async () => {
    setConfig({});

    renderApp();

    expect(await screen.findByTestId('RangeSelectList')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hours' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Planner' }));

    expect(screen.getByTestId('MonthPlanner')).toBeInTheDocument();
    expect(screen.queryByTestId('RangeSelectList')).not.toBeInTheDocument();
    expect(screen.getByTestId('CalendarsList')).toBeInTheDocument();
    expect(readConfig().view).toBe('planner');

    fireEvent.click(screen.getByRole('button', { name: 'Hours' }));

    expect(screen.getByTestId('RangeSelectList')).toBeInTheDocument();
    expect(screen.queryByTestId('MonthPlanner')).not.toBeInTheDocument();
    expect(readConfig().view).toBe('hours');
  });

  it('restores the planner view from localStorage', async () => {
    await renderPlanner();

    expect(screen.queryByTestId('RangeSelectList')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Planner' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('shows a message when no calendar is selected', async () => {
    window.localStorage.setItem('config', JSON.stringify({ view: 'planner' }));

    renderApp();

    expect(
      await screen.findByText('Please select a calendar to plan days.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('MonthPlanner')).not.toBeInTheDocument();
  });

  it('shows a loading state while events load', async () => {
    window.sessionStorage.setItem('accessToken', 'eventsWithDelay');

    renderApp();

    expect(await screen.findByText('Loading events…')).toBeInTheDocument();
    expect(screen.queryByTestId('MonthPlanner')).not.toBeInTheDocument();
  });

  it('renders hours in the matching day cells', async () => {
    await renderPlanner();

    expect(
      screen.getByRole('region', { name: 'January 2018' })
    ).toBeInTheDocument();
    expect(getDay('2018-01-05')).toHaveTextContent('53.5h');
    expect(getDay('2018-01-05')).toHaveAccessibleName(
      'Fri 5 Jan 2018, 3.5 hours'
    );
    expect(getDay('2018-01-10')).toHaveTextContent('102h');
    expect(getDay('2018-01-04')).toHaveTextContent(/^4$/);
    expect(getDay('2018-01-04')).toHaveAccessibleName(
      'Thu 4 Jan 2018, 0 hours'
    );
    expect(getDay('2018-01-01')).toHaveAttribute('aria-current', 'date');
    expect(getDay('2018-01-02')).not.toHaveAttribute('aria-current');
    // Only January is shown, without leading/trailing day buttons.
    expect(document.querySelectorAll('[data-day]')).toHaveLength(31);
    expect(
      screen.getByRole('button', { name: /^Toggle all days of January 2018/ })
    ).toHaveTextContent('January 20185.5 h');
  });

  it('shades days by hours with a visible floor for light days', async () => {
    await renderPlanner();

    const heat = (day) => Number(getDay(day).style.getPropertyValue('--heat'));

    expect(heat('2018-01-04')).toBe(0);
    // 2h: sqrt curve above the 0.25 floor, not a barely visible 0.2.
    expect(heat('2018-01-10')).toBeCloseTo(0.25 + 0.75 * Math.sqrt(0.2));
    expect(heat('2018-01-05')).toBeGreaterThan(heat('2018-01-10'));
    expect(heat('2018-01-05')).toBeLessThan(1);
  });

  it('toggles a day on click and updates the total', async () => {
    await renderPlanner();

    expect(getTotal()).toHaveTextContent('0 days · 0 h');
    expect(getDay('2018-01-05')).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(getDay('2018-01-05'));

    expect(getDay('2018-01-05')).toHaveAttribute('aria-pressed', 'true');
    expect(getTotal()).toHaveTextContent('1 day · 3.5 h');
    expect(getTotal()).toHaveTextContent('Jan 2018: 1 d · 3.5 h');

    fireEvent.click(getDay('2018-01-10'));

    expect(getTotal()).toHaveTextContent('2 days · 5.5 h');

    fireEvent.click(getDay('2018-01-05'));

    expect(getDay('2018-01-05')).toHaveAttribute('aria-pressed', 'false');
    expect(getTotal()).toHaveTextContent('1 day · 2 h');
  });

  it('toggles a day on a pointer tap followed by its click exactly once', async () => {
    await renderPlanner();

    fireEvent.pointerDown(getDay('2018-01-05'));
    // A tap shows the pending state before the click commits it.
    expect(getDay('2018-01-05')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.pointerUp(getDay('2018-01-05'));
    fireEvent.click(getDay('2018-01-05'));

    expect(getDay('2018-01-05')).toHaveAttribute('aria-pressed', 'true');
    expect(getTotal()).toHaveTextContent('1 day · 3.5 h');
  });

  it('selects a range by dragging, with a preview before committing', async () => {
    await renderPlanner();

    drag('2018-01-04', '2018-01-10');

    // Preview only: rendered as selected, but not committed yet.
    expect(getDay('2018-01-07')).toHaveAttribute('aria-pressed', 'true');
    expect(getTotal()).toHaveTextContent('0 days · 0 h');
    expect(readConfig().selectedDays).toBeUndefined();

    fireEvent.pointerUp(window);
    // The browser fires a click on the common ancestor/cell under pointer;
    // it must not toggle the end day back.
    fireEvent.click(getDay('2018-01-10'));

    expect(getTotal()).toHaveTextContent('7 days · 5.5 h');
    expect(getDay('2018-01-03')).toHaveAttribute('aria-pressed', 'false');
    expect(getDay('2018-01-04')).toHaveAttribute('aria-pressed', 'true');
    expect(getDay('2018-01-10')).toHaveAttribute('aria-pressed', 'true');
    expect(getDay('2018-01-11')).toHaveAttribute('aria-pressed', 'false');
    expect(readConfig().selectedDays).toEqual([
      '2018-01-04',
      '2018-01-05',
      '2018-01-06',
      '2018-01-07',
      '2018-01-08',
      '2018-01-09',
      '2018-01-10',
    ]);
  });

  it('selects a range when dragging backwards', async () => {
    await renderPlanner();

    drag('2018-01-06', '2018-01-04');
    fireEvent.pointerUp(window);

    expect(getTotal()).toHaveTextContent('3 days · 3.5 h');
  });

  it('deselects a range when the drag starts on a selected day', async () => {
    await renderPlanner();

    drag('2018-01-01', '2018-01-12');
    fireEvent.pointerUp(window);
    expect(getTotal()).toHaveTextContent('12 days · 5.5 h');

    drag('2018-01-05', '2018-01-08');
    expect(getDay('2018-01-06')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.pointerUp(window);

    expect(getTotal()).toHaveTextContent('8 days · 2 h');
    expect(getDay('2018-01-04')).toHaveAttribute('aria-pressed', 'true');
    expect(getDay('2018-01-05')).toHaveAttribute('aria-pressed', 'false');
    expect(getDay('2018-01-08')).toHaveAttribute('aria-pressed', 'false');
    expect(getDay('2018-01-09')).toHaveAttribute('aria-pressed', 'true');
  });

  it('cancels a drag with Escape', async () => {
    await renderPlanner();

    drag('2018-01-04', '2018-01-10');
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(getDay('2018-01-07')).toHaveAttribute('aria-pressed', 'false');

    fireEvent.pointerUp(window);
    fireEvent.click(getDay('2018-01-04'));

    expect(getTotal()).toHaveTextContent('0 days · 0 h');
  });

  it('ignores pointer moves outside of day cells', async () => {
    await renderPlanner();

    fireEvent.pointerDown(getDay('2018-01-04'));
    document.elementFromPoint = jest.fn(() => document.body);
    fireEvent.pointerMove(window);
    fireEvent.pointerUp(window);
    fireEvent.click(getDay('2018-01-04'));

    expect(getTotal()).toHaveTextContent('1 day · 0 h');
  });

  it('selects a range with shift-click from the last clicked day', async () => {
    await renderPlanner();

    fireEvent.click(getDay('2018-01-03'));
    fireEvent.click(getDay('2018-01-06'), { shiftKey: true });

    expect(getTotal()).toHaveTextContent('4 days · 3.5 h');
    expect(getDay('2018-01-02')).toHaveAttribute('aria-pressed', 'false');
    expect(getDay('2018-01-07')).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles a single day on shift-click without a previous click', async () => {
    await renderPlanner();

    fireEvent.click(getDay('2018-01-05'), { shiftKey: true });

    expect(getTotal()).toHaveTextContent('1 day · 3.5 h');
  });

  it('toggles the whole month via its header', async () => {
    await renderPlanner();

    const header = screen.getByRole('button', {
      name: /^Toggle all days of January 2018/,
    });

    fireEvent.click(getDay('2018-01-05'));
    fireEvent.click(header);

    expect(getTotal()).toHaveTextContent('31 days · 5.5 h');
    expect(getTotal()).toHaveTextContent('Jan 2018: 31 d · 5.5 h');

    fireEvent.click(header);

    expect(getTotal()).toHaveTextContent('0 days · 0 h');
  });

  it('clears the selection', async () => {
    await renderPlanner();

    const clear = screen.getByRole('button', { name: 'Clear' });
    expect(clear).toBeDisabled();

    fireEvent.click(getDay('2018-01-05'));
    fireEvent.click(getDay('2018-01-10'));
    expect(clear).toBeEnabled();

    fireEvent.click(clear);

    expect(getTotal()).toHaveTextContent('0 days · 0 h');
    expect(clear).toBeDisabled();
    expect(readConfig().selectedDays).toEqual([]);
  });

  it('navigates months with prev, next and today', async () => {
    await renderPlanner();

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));

    expect(
      screen.getByRole('region', { name: 'February 2018' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'January 2018' })
    ).not.toBeInTheDocument();
    expect(getDay('2018-02-02')).toHaveAccessibleName('Fri 2 Feb 2018, 1 hour');

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));

    expect(
      screen.getByRole('region', { name: 'December 2017' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));

    expect(
      screen.getByRole('region', { name: 'January 2018' })
    ).toBeInTheDocument();
  });

  it('keeps the selection while navigating and totals per month', async () => {
    await renderPlanner();

    fireEvent.click(getDay('2018-01-05'));
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    fireEvent.click(getDay('2018-02-02'));

    expect(getTotal()).toHaveTextContent('2 days · 4.5 h');
    expect(getTotal()).toHaveTextContent('Jan 2018: 1 d · 3.5 h');
    expect(getTotal()).toHaveTextContent('Feb 2018: 1 d · 1 h');
  });

  it('shows 3 and 12 months and persists the layout', async () => {
    await renderPlanner();

    fireEvent.click(screen.getByRole('button', { name: '3 mo' }));

    expect(screen.getByRole('button', { name: '3 mo' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(
      screen.getAllByRole('region').map((region) => region.dataset.month)
    ).toEqual(['2018-01', '2018-02', '2018-03']);
    expect(readConfig().monthsShown).toBe(3);

    fireEvent.click(screen.getByRole('button', { name: '12 mo' }));

    expect(screen.getAllByRole('region')).toHaveLength(12);
    expect(
      screen.getByRole('region', { name: 'December 2018' })
    ).toBeInTheDocument();
  });

  it('drags a range across months in the 3 month layout', async () => {
    setConfig({ view: 'planner', monthsShown: 3 });

    await renderPlanner();

    drag('2018-01-30', '2018-02-02');
    fireEvent.pointerUp(window);

    expect(getTotal()).toHaveTextContent('4 days · 1 h');
    expect(getTotal()).toHaveTextContent('Jan 2018: 2 d · 0 h');
    expect(getTotal()).toHaveTextContent('Feb 2018: 2 d · 1 h');
  });

  it('restores the selection after reloading the store from localStorage', async () => {
    const { unmount } = await renderPlanner();

    fireEvent.click(getDay('2018-01-05'));
    fireEvent.click(getDay('2018-01-10'));
    fireEvent.click(screen.getByRole('button', { name: '3 mo' }));
    unmount();

    await renderPlanner();

    expect(getDay('2018-01-05')).toHaveAttribute('aria-pressed', 'true');
    expect(getDay('2018-01-10')).toHaveAttribute('aria-pressed', 'true');
    expect(getTotal()).toHaveTextContent('2 days · 5.5 h');
    expect(screen.getAllByRole('region')).toHaveLength(3);
  });

  it('reorders the weekday header when the week start changes', async () => {
    await renderPlanner();

    const weekdays = () =>
      within(screen.getByRole('region', { name: 'January 2018' })).getByTestId(
        'Weekdays'
      );

    expect(weekdays()).toHaveTextContent('MonTueWedThuFriSatSun');
    // 1 Jan 2018 is a Monday: no leading empty cells.
    expect(weekdays().nextSibling.firstChild).toBe(getDay('2018-01-01'));

    fireEvent.click(screen.getByLabelText('Sunday'));

    expect(weekdays()).toHaveTextContent('SunMonTueWedThuFriSat');
    expect(weekdays().nextSibling.firstChild).not.toHaveAttribute('data-day');
    expect(weekdays().nextSibling.children[1]).toBe(getDay('2018-01-01'));
    expect(readConfig().weekStart).toBe('sunday');
  });
});
