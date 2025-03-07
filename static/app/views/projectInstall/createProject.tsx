import {Component, Fragment} from 'react';
// eslint-disable-next-line no-restricted-imports
import {browserHistory, withRouter, WithRouterProps} from 'react-router';
import styled from '@emotion/styled';
import * as Sentry from '@sentry/react';
import {PlatformIcon} from 'platformicons';

import {openCreateTeamModal} from 'sentry/actionCreators/modal';
import Alert from 'sentry/components/alert';
import Button from 'sentry/components/button';
import TeamSelector from 'sentry/components/forms/teamSelector';
import Input from 'sentry/components/input';
import PageHeading from 'sentry/components/pageHeading';
import PlatformPicker from 'sentry/components/platformPicker';
import categoryList from 'sentry/data/platformCategories';
import {IconAdd} from 'sentry/icons';
import {t} from 'sentry/locale';
import ProjectsStore from 'sentry/stores/projectsStore';
import space from 'sentry/styles/space';
import {Organization, Team} from 'sentry/types';
import {logExperiment} from 'sentry/utils/analytics';
import trackAdvancedAnalyticsEvent from 'sentry/utils/analytics/trackAdvancedAnalyticsEvent';
import getPlatformName from 'sentry/utils/getPlatformName';
import slugify from 'sentry/utils/slugify';
import withApi from 'sentry/utils/withApi';
import withOrganization from 'sentry/utils/withOrganization';
import withTeams from 'sentry/utils/withTeams';
import IssueAlertOptions from 'sentry/views/projectInstall/issueAlertOptions';

import {PRESET_AGGREGATES} from '../alerts/rules/metric/presets';

const getCategoryName = (category?: string) =>
  categoryList.find(({id}) => id === category)?.id;

type Props = WithRouterProps & {
  api: any;
  organization: Organization;
  teams: Team[];
};

type PlatformName = React.ComponentProps<typeof PlatformIcon>['platform'];
type IssueAlertFragment = Parameters<
  React.ComponentProps<typeof IssueAlertOptions>['onChange']
>[0];

type State = {
  dataFragment: IssueAlertFragment | undefined;
  error: boolean;
  inFlight: boolean;
  platform: PlatformName | null;
  projectName: string;
  team: string;
};

class CreateProject extends Component<Props, State> {
  constructor(props: Props, context) {
    super(props, context);

    const {teams, location} = props;
    const {query} = location;
    const accessTeams = teams.filter((team: Team) => team.hasAccess);

    const team = query.team || (accessTeams.length && accessTeams[0].slug);
    const platform = getPlatformName(query.platform) ? query.platform : '';

    this.state = {
      error: false,
      projectName: getPlatformName(platform) || '',
      team,
      platform,
      inFlight: false,
      dataFragment: undefined,
    };
  }

  componentDidMount() {
    trackAdvancedAnalyticsEvent('project_creation_page.viewed', {
      organization: this.props.organization,
    });
    logExperiment({
      key: 'MetricAlertOnProjectCreationExperiment',
      organization: this.props.organization,
    });
  }

  get defaultCategory() {
    const {query} = this.props.location;
    return getCategoryName(query.category);
  }

  renderProjectForm() {
    const {organization} = this.props;
    const {projectName, platform, team} = this.state;

    const createProjectForm = (
      <CreateProjectForm onSubmit={this.createProject}>
        <div>
          <FormLabel>{t('Project name')}</FormLabel>
          <ProjectNameInputWrap>
            <StyledPlatformIcon platform={platform ?? ''} size={20} />
            <ProjectNameInput
              type="text"
              name="name"
              placeholder={t('project-name')}
              autoComplete="off"
              value={projectName}
              onChange={e => this.setState({projectName: slugify(e.target.value)})}
            />
          </ProjectNameInputWrap>
        </div>
        <div>
          <FormLabel>{t('Team')}</FormLabel>
          <TeamSelectInput>
            <TeamSelector
              name="select-team"
              menuPlacement="auto"
              clearable={false}
              value={team}
              placeholder={t('Select a Team')}
              onChange={choice => this.setState({team: choice.value})}
              teamFilter={(filterTeam: Team) => filterTeam.hasAccess}
            />
            <Button
              borderless
              data-test-id="create-team"
              type="button"
              icon={<IconAdd isCircled />}
              onClick={() =>
                openCreateTeamModal({
                  organization,
                  onClose: ({slug}) => this.setState({team: slug}),
                })
              }
              title={t('Create a team')}
              aria-label={t('Create a team')}
            />
          </TeamSelectInput>
        </div>
        <div>
          <Button
            data-test-id="create-project"
            priority="primary"
            disabled={!this.canSubmitForm}
          >
            {t('Create Project')}
          </Button>
        </div>
      </CreateProjectForm>
    );

    return (
      <Fragment>
        <PageHeading withMargins>{t('Give your project a name')}</PageHeading>
        {createProjectForm}
      </Fragment>
    );
  }

  get canSubmitForm() {
    const {projectName, team, inFlight} = this.state;
    const {shouldCreateCustomRule, conditions} = this.state.dataFragment || {};

    return (
      !inFlight &&
      team &&
      projectName !== '' &&
      (!shouldCreateCustomRule || conditions?.every?.(condition => condition.value))
    );
  }

  createProject = async e => {
    e.preventDefault();
    const {organization, api} = this.props;
    const {projectName, platform, team, dataFragment} = this.state;
    const {slug} = organization;
    const {
      shouldCreateCustomRule,
      name,
      conditions,
      actions,
      actionMatch,
      frequency,
      defaultRules,
      metricAlertPresets,
    } = dataFragment || {};

    this.setState({inFlight: true});

    if (!projectName) {
      Sentry.withScope(scope => {
        scope.setExtra('props', this.props);
        scope.setExtra('state', this.state);
        Sentry.captureMessage('No project name');
      });
    }

    try {
      const projectData = await api.requestPromise(`/teams/${slug}/${team}/projects/`, {
        method: 'POST',
        data: {
          name: projectName,
          platform,
          default_rules: defaultRules ?? true,
        },
      });

      let ruleId: string | undefined;
      if (shouldCreateCustomRule) {
        const ruleData = await api.requestPromise(
          `/projects/${organization.slug}/${projectData.slug}/rules/`,
          {
            method: 'POST',
            data: {
              name,
              conditions,
              actions,
              actionMatch,
              frequency,
            },
          }
        );
        ruleId = ruleData.id;
      }
      if (
        !!organization.experiments.MetricAlertOnProjectCreationExperiment &&
        metricAlertPresets &&
        metricAlertPresets.length > 0
      ) {
        const presets = PRESET_AGGREGATES.filter(aggregate =>
          metricAlertPresets.includes(aggregate.id)
        );
        const teamObj = this.props.teams.find(aTeam => aTeam.slug === team);
        await Promise.all([
          presets.map(preset => {
            const context = preset.makeUnqueriedContext(
              {
                ...projectData,
                teams: teamObj ? [teamObj] : [],
              },
              organization
            );

            return api.requestPromise(
              `/projects/${organization.slug}/${projectData.slug}/alert-rules/?referrer=create_project`,
              {
                method: 'POST',
                data: {
                  aggregate: context.aggregate,
                  comparisonDelta: context.comparisonDelta,
                  dataset: context.dataset,
                  eventTypes: context.eventTypes,
                  name: context.name,
                  owner: null,
                  projectId: projectData.id,
                  projects: [projectData.slug],
                  query: '',
                  resolveThreshold: null,
                  thresholdPeriod: 1,
                  thresholdType: context.thresholdType,
                  timeWindow: context.timeWindow,
                  triggers: context.triggers,
                },
              }
            );
          }),
        ]);
      }
      trackAdvancedAnalyticsEvent('project_creation_page.created', {
        organization,
        metric_alerts: (metricAlertPresets || []).join(','),
        issue_alert: defaultRules
          ? 'Default'
          : shouldCreateCustomRule
          ? 'Custom'
          : 'No Rule',
        project_id: projectData.id,
        rule_id: ruleId || '',
      });

      ProjectsStore.onCreateSuccess(projectData, organization.slug);

      const platformKey = platform || 'other';
      const nextUrl = `/${organization.slug}/${projectData.slug}/getting-started/${platformKey}/`;
      browserHistory.push(nextUrl);
    } catch (err) {
      this.setState({
        inFlight: false,
        error: err.responseJSON.detail,
      });

      // Only log this if the error is something other than:
      // * The user not having access to create a project, or,
      // * A project with that slug already exists
      if (err.status !== 403 && err.status !== 409) {
        Sentry.withScope(scope => {
          scope.setExtra('err', err);
          scope.setExtra('props', this.props);
          scope.setExtra('state', this.state);
          Sentry.captureMessage('Project creation failed');
        });
      }
    }
  };

  setPlatform = (platformId: PlatformName | null) =>
    this.setState(({projectName, platform}: State) => ({
      platform: platformId,
      projectName:
        !projectName || (platform && getPlatformName(platform) === projectName)
          ? getPlatformName(platformId) || ''
          : projectName,
    }));

  render() {
    const {platform, error} = this.state;

    return (
      <Fragment>
        {error && <Alert type="error">{error}</Alert>}

        <div data-test-id="onboarding-info">
          <PageHeading withMargins>{t('Create a new Project')}</PageHeading>
          <HelpText>
            {t(
              `Projects allow you to scope error and transaction events to a specific
               application in your organization. For example, you might have separate
               projects for your API server and frontend client.`
            )}
          </HelpText>
          <PageHeading withMargins>{t('Choose a platform')}</PageHeading>
          <PlatformPicker
            platform={platform}
            defaultCategory={this.defaultCategory}
            setPlatform={this.setPlatform}
            organization={this.props.organization}
            showOther
          />
          <IssueAlertOptions
            onChange={updatedData => {
              this.setState({dataFragment: updatedData});
            }}
          />
          {this.renderProjectForm()}
        </div>
      </Fragment>
    );
  }
}

// TODO(davidenwang): change to functional component and replace withTeams with useTeams
export default withApi(withRouter(withOrganization(withTeams(CreateProject))));
export {CreateProject};

const CreateProjectForm = styled('form')`
  display: grid;
  grid-template-columns: 300px minmax(250px, max-content) max-content;
  gap: ${space(2)};
  align-items: end;
  padding: ${space(3)} 0;
  box-shadow: 0 -1px 0 rgba(0, 0, 0, 0.1);
  background: ${p => p.theme.background};
`;

const FormLabel = styled('div')`
  font-size: ${p => p.theme.fontSizeExtraLarge};
  margin-bottom: ${space(1)};
`;

const ProjectNameInputWrap = styled('div')`
  position: relative;
`;

const ProjectNameInput = styled(Input)`
  padding-left: calc(${p => p.theme.formPadding.md.paddingLeft}px * 1.5 + 20px);
`;

const StyledPlatformIcon = styled(PlatformIcon)`
  position: absolute;
  top: 50%;
  left: ${p => p.theme.formPadding.md.paddingLeft}px;
  transform: translateY(-50%);
`;

const TeamSelectInput = styled('div')`
  display: grid;
  gap: ${space(1)};
  grid-template-columns: 1fr min-content;
  align-items: center;
`;

const HelpText = styled('p')`
  color: ${p => p.theme.subText};
  max-width: 760px;
`;
