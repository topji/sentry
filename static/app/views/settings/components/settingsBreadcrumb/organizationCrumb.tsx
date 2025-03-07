import {browserHistory, RouteComponentProps} from 'react-router';
import styled from '@emotion/styled';

import IdBadge from 'sentry/components/idBadge';
import {Organization} from 'sentry/types';
import recreateRoute from 'sentry/utils/recreateRoute';
import withLatestContext from 'sentry/utils/withLatestContext';
import BreadcrumbDropdown from 'sentry/views/settings/components/settingsBreadcrumb/breadcrumbDropdown';
import findFirstRouteWithoutRouteParam from 'sentry/views/settings/components/settingsBreadcrumb/findFirstRouteWithoutRouteParam';
import MenuItem from 'sentry/views/settings/components/settingsBreadcrumb/menuItem';

import {CrumbLink} from '.';

type Props = RouteComponentProps<{projectId?: string}, {}> & {
  organization: Organization;
  organizations: Organization[];
};

const OrganizationCrumb = ({
  organization,
  organizations,
  params,
  routes,
  route,
  ...props
}: Props) => {
  const handleSelect = (item: {value: string}) => {
    // If we are currently in a project context, and we're attempting to switch organizations,
    // then we need to default to index route (e.g. `route`)
    //
    // Otherwise, find the last route without a router param
    // e.g. if you are on API details, we want the API listing
    // This fails if our route tree is not nested
    const hasProjectParam = !!params.projectId;
    let destination = hasProjectParam
      ? route
      : findFirstRouteWithoutRouteParam(routes.slice(routes.indexOf(route)));

    // It's possible there is no route without route params (e.g. organization settings index),
    // in which case, we can use the org settings index route (e.g. `route`)
    if (!hasProjectParam && typeof destination === 'undefined') {
      destination = route;
    }

    if (destination === undefined) {
      return;
    }

    browserHistory.push(
      recreateRoute(destination, {
        routes,
        params: {...params, orgId: item.value},
      })
    );
  };

  if (!organization) {
    return null;
  }

  const hasMenu = organizations.length > 1;

  return (
    <BreadcrumbDropdown
      name={
        <CrumbLink
          to={recreateRoute(route, {
            routes,
            params: {...params, orgId: organization.slug},
          })}
        >
          <BadgeWrapper>
            <IdBadge avatarSize={18} organization={organization} />
          </BadgeWrapper>
        </CrumbLink>
      }
      onSelect={handleSelect}
      hasMenu={hasMenu}
      route={route}
      items={organizations.map((org, index) => ({
        index,
        value: org.slug,
        label: (
          <MenuItem>
            <IdBadge organization={org} />
          </MenuItem>
        ),
      }))}
      {...props}
    />
  );
};

const BadgeWrapper = styled('div')`
  display: flex;
  align-items: center;
`;

export {OrganizationCrumb};
export default withLatestContext(OrganizationCrumb);
