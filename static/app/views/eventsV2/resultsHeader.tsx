import {Component} from 'react';
import {InjectedRouter} from 'react-router';
import styled from '@emotion/styled';
import {Location} from 'history';

import {fetchHomepageQuery} from 'sentry/actionCreators/discoverHomepageQueries';
import {fetchSavedQuery} from 'sentry/actionCreators/discoverSavedQueries';
import {Client} from 'sentry/api';
import * as Layout from 'sentry/components/layouts/thirds';
import TimeSince from 'sentry/components/timeSince';
import {t} from 'sentry/locale';
import space from 'sentry/styles/space';
import {Organization, SavedQuery} from 'sentry/types';
import EventView from 'sentry/utils/discover/eventView';
import withApi from 'sentry/utils/withApi';

import DiscoverBreadcrumb from './breadcrumb';
import EventInputName from './eventInputName';
import SavedQueryButtonGroup from './savedQuery';

type Props = {
  api: Client;
  errorCode: number;
  eventView: EventView;
  location: Location;
  organization: Organization;
  router: InjectedRouter;
  setSavedQuery: (savedQuery: SavedQuery) => void;
  yAxis: string[];
  isHomepage?: boolean;
};

type State = {
  homepageQuery: SavedQuery | undefined;
  loading: boolean;
  savedQuery: SavedQuery | undefined;
};

class ResultsHeader extends Component<Props, State> {
  state: State = {
    homepageQuery: undefined,
    savedQuery: undefined,
    loading: true,
  };

  componentDidMount() {
    const {eventView, isHomepage} = this.props;
    const {loading} = this.state;
    if (!isHomepage && eventView.id) {
      this.fetchData();
    } else if (eventView.id === undefined && loading) {
      // If this is a new query, there's nothing to load
      this.setState({loading: false});
    }
    if (isHomepage) {
      this.fetchHomepageQueryData();
    }
  }

  componentDidUpdate(prevProps: Props) {
    if (
      prevProps.eventView &&
      this.props.eventView &&
      prevProps.eventView.id !== this.props.eventView.id
    ) {
      this.fetchData();
    }
  }

  fetchData() {
    const {api, eventView, organization, isHomepage} = this.props;
    if (!isHomepage && typeof eventView.id === 'string') {
      this.setState({loading: true});
      fetchSavedQuery(api, organization.slug, eventView.id).then(savedQuery => {
        this.setState({savedQuery, loading: false});
      });
    }
  }

  fetchHomepageQueryData() {
    const {api, organization} = this.props;
    this.setState({loading: true});
    fetchHomepageQuery(api, organization.slug).then(homepageQuery => {
      this.setState({homepageQuery, loading: false});
    });
  }

  renderAuthor() {
    const {eventView, isHomepage} = this.props;
    const {savedQuery} = this.state;
    // No saved query in use.
    if (!eventView.id || isHomepage) {
      return null;
    }
    let createdBy = ' \u2014 ';
    let lastEdit: React.ReactNode = ' \u2014 ';
    if (savedQuery !== undefined) {
      createdBy = savedQuery.createdBy?.email || '\u2014';
      lastEdit = <TimeSince date={savedQuery.dateUpdated} />;
    }
    return (
      <Subtitle>
        {t('Created by:')} {createdBy} | {t('Last edited:')} {lastEdit}
      </Subtitle>
    );
  }

  render() {
    const {
      organization,
      location,
      errorCode,
      eventView,
      yAxis,
      router,
      setSavedQuery,
      isHomepage,
    } = this.props;
    const {savedQuery, loading, homepageQuery} = this.state;

    return (
      <Layout.Header>
        <StyledHeaderContent>
          <DiscoverBreadcrumb
            eventView={eventView}
            organization={organization}
            location={location}
            isHomepage={isHomepage}
          />
          <EventInputName
            savedQuery={savedQuery}
            organization={organization}
            eventView={eventView}
            isHomepage={isHomepage}
          />
          {this.renderAuthor()}
        </StyledHeaderContent>
        <Layout.HeaderActions>
          <SavedQueryButtonGroup
            setSavedQuery={setSavedQuery}
            location={location}
            organization={organization}
            eventView={eventView}
            savedQuery={savedQuery}
            queryDataLoading={loading}
            disabled={errorCode >= 400 && errorCode < 500}
            updateCallback={() => this.fetchData()}
            yAxis={yAxis}
            router={router}
            isHomepage={isHomepage}
            setHomepageQuery={updatedHomepageQuery =>
              this.setState({homepageQuery: updatedHomepageQuery})
            }
            homepageQuery={homepageQuery}
          />
        </Layout.HeaderActions>
      </Layout.Header>
    );
  }
}

const Subtitle = styled('h4')`
  font-size: ${p => p.theme.fontSizeLarge};
  font-weight: normal;
  color: ${p => p.theme.gray300};
  margin: ${space(0.5)} 0 0 0;
`;

const StyledHeaderContent = styled(Layout.HeaderContent)`
  overflow: unset;
`;

export default withApi(ResultsHeader);
