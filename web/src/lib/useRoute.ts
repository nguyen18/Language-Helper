import { useEffect, useState } from 'react'

// Hash-based routes, so refresh and the back button work without a router library or server config.
export type Route = 'home' | 'discover'

export const ROUTE_HREF: Record<Route, string> = {
  home: '#/',
  discover: '#/discover',
}

function readRoute(): Route {
  return window.location.hash === ROUTE_HREF.discover ? 'discover' : 'home'
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(readRoute)
  useEffect(() => {
    const onChange = () => setRoute(readRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
