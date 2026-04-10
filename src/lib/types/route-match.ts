/**
 * Function to determine if a given pathname matches a route.
 *
 * @param pathname - The pathname of the incoming request
 * @returns true if the pathname matches the route, false otherwise
 *
 */
export type RouteMatch = (pathname: string) => boolean;
