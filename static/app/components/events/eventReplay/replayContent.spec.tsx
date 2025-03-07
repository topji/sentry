import {render as baseRender, screen} from 'sentry-test/reactTestingLibrary';

import useReplayData from 'sentry/utils/replays/hooks/useReplayData';
import ReplayReader from 'sentry/utils/replays/replayReader';
import {OrganizationContext} from 'sentry/views/organizationContext';

import ReplayContent from './replayContent';

const mockOrgSlug = 'sentry-emerging-tech';
const mockReplaySlug = 'replays:761104e184c64d439ee1014b72b4d83b';

const mockStartedAt = 'Sep 22, 2022 4:58:39 PM UTC';
const mockFinishedAt = 'Sep 22, 2022 5:00:03 PM UTC';

const mockReplayDuration = 84; // seconds

const mockEvent = {
  ...TestStubs.Event(),
  dateCreated: '2022-09-22T16:59:41.596000Z',
};

const mockButtonHref =
  '/organizations/sentry-emerging-tech/replays/replays:761104e184c64d439ee1014b72b4d83b/?t=62&t_main=console';

// Mock screenfull library
jest.mock('screenfull', () => ({
  enabled: true,
  isFullscreen: false,
  request: jest.fn(),
  exit: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
}));

// Get replay data with the mocked replay reader params
const replayReaderParams = TestStubs.ReplayReaderParams({
  replayRecord: {
    startedAt: new Date(mockStartedAt),
    finishedAt: new Date(mockFinishedAt),
    duration: mockReplayDuration,
  },
});
const mockReplay = ReplayReader.factory(replayReaderParams);

// Mock useReplayData hook to return the mocked replay data
jest.mock('sentry/utils/replays/hooks/useReplayData', () => {
  return {
    __esModule: true,
    default: jest.fn(() => {
      return {
        replay: mockReplay,
        fetching: false,
      };
    }),
  };
});

const render: typeof baseRender = children => {
  return baseRender(
    <OrganizationContext.Provider value={TestStubs.Organization()}>
      {children}
    </OrganizationContext.Provider>,
    {context: TestStubs.routerContext()}
  );
};

describe('ReplayContent', () => {
  it('Should render a placeholder when is fetching the replay data', () => {
    // Change the mocked hook to return a loading state
    (useReplayData as jest.Mock).mockImplementationOnce(() => {
      return {
        replay: mockReplay,
        fetching: true,
      };
    });

    render(
      <ReplayContent
        orgSlug={mockOrgSlug}
        replaySlug={mockReplaySlug}
        event={mockEvent}
      />
    );

    expect(screen.getByTestId('replay-loading-placeholder')).toBeInTheDocument();
  });

  it('Should throw error when there is a fetch error', () => {
    // Change the mocked hook to return a fetch error
    (useReplayData as jest.Mock).mockImplementationOnce(() => {
      return {
        replay: null,
        fetching: false,
        fetchError: {status: 400},
      };
    });

    expect(() =>
      render(
        <ReplayContent
          orgSlug={mockOrgSlug}
          replaySlug={mockReplaySlug}
          event={mockEvent}
        />
      )
    ).toThrow();
  });

  it('Should render details button when there is a replay', () => {
    render(
      <ReplayContent
        orgSlug={mockOrgSlug}
        replaySlug={mockReplaySlug}
        event={mockEvent}
      />
    );

    const detailButton = screen.getByTestId('view-replay-button');
    expect(detailButton).toBeVisible();

    // Expect the details button to have the correct href
    expect(detailButton).toHaveAttribute('href', mockButtonHref);
  });

  it('Should render all its elements correctly', () => {
    render(
      <ReplayContent
        orgSlug={mockOrgSlug}
        replaySlug={mockReplaySlug}
        event={mockEvent}
      />
    );

    // Expect replay view to be rendered
    expect(screen.getByText('Replays')).toBeVisible();
    expect(screen.getByTestId('player-container')).toBeInTheDocument();
  });
});
