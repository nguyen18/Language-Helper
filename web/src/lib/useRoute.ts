import { useEffect, useState } from 'react'

// Hash-based routes, so refresh and the back button work without a router library or server config.
export type Route = 'home' | 'discover' | 'cheatsheet'

export const ROUTE_HREF: Record<Route, string> = {
  home: '#/',
  discover: '#/discover',
  cheatsheet: '#/cheatsheet',
}

function readRoute(): Route {
  const match = (Object.keys(ROUTE_HREF) as Route[]).find((r) => ROUTE_HREF[r] === window.location.hash)
  return match ?? 'home'
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
