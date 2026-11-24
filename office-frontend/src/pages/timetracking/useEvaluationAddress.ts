import { useState } from 'react'
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom'
import {
  evaluationFilterOf,
  evaluationSearchOf,
  evaluationViewOf,
  type TimeEvaluationFilter,
  type TimeEvaluationView,
} from '../../lib/timeEvaluation'

/** The router state a keystroke in the search writes the address with. */
const TYPED = { evaluationSearchTyped: true }

function isTyped(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'evaluationSearchTyped' in state
}

/**
 * The question of the evaluation, held in the address so a link passes it on and a reload keeps
 * it (frontend ADR-0086).
 *
 * <p>Every change replaces the address rather than pushing one: the back button belongs to the
 * screen somebody came from, not to the filter they last tried. Only a click on a group pushes,
 * and that is a link of its own.
 *
 * <p><b>The search field keeps its own value.</b> The address follows every keystroke, but the
 * router writes it in a transition, and a field fed back from there loses a letter typed while
 * the transition is under way. So the field holds what was typed; when the address moves under
 * it — the menu, the back button, a reset, a click on a group — the field follows the address.
 * Its own echo, marked in the router state, it ignores.
 *
 * @param today the day it is, for the range of an address that names none
 * @param projectsOn whether the tenant runs the projects
 * @returns the filter as on screen, the view, and the ways to change them
 */
export function useEvaluationAddress(today: string, projectsOn: boolean) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigationType = useNavigationType()
  const fromAddress = evaluationFilterOf(params, today, projectsOn)
  const view = evaluationViewOf(params, projectsOn)

  const [field, setField] = useState({ value: fromAddress.search, key: location.key })
  if (field.key !== location.key) {
    const echo = navigationType !== 'POP' && isTyped(location.state)
    setField({ value: echo ? field.value : fromAddress.search, key: location.key })
  }

  const filter: TimeEvaluationFilter = { ...fromAddress, search: field.value }

  const write = (next: TimeEvaluationFilter, nextView: TimeEvaluationView, typed = false) =>
    setParams(evaluationSearchOf(next, nextView), {
      replace: true,
      state: typed ? TYPED : undefined,
    })

  return {
    filter,
    view,
    /** Replaces the whole filter; the search goes as the filter carries it. */
    setFilter: (next: TimeEvaluationFilter) => write(next, view),
    setView: (next: TimeEvaluationView) => write(filter, next),
    /** What was typed into the search, keystroke by keystroke. */
    setSearch: (value: string) => {
      setField({ value, key: location.key })
      write({ ...fromAddress, search: value }, view, true)
    },
  }
}
