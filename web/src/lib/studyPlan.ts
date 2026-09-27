import type { Route } from './useRoute'

export type StudyTask = {
  id: string
  text: string
  detail: string
  link?: { route: Route; label: string }
}

// Mai's study guideline on the home page. Ids are stored in localStorage, so keep them stable when editing text.
export const STUDY_PLAN: StudyTask[] = [
  {
    id: 'chat',
    text: 'Chat with me so I can learn how you talk',
    detail: 'Answer the way you would text a friend. Fillers like "um" and "like" are welcome.',
    link: { route: 'discover', label: 'Start chatting' },
  },
  {
    id: 'review',
    text: 'Look over your top 100 words',
    detail: 'Notice the little words you lean on, like "so", "really" and "like". Those are the first ones worth learning.',
    link: { route: 'discover', label: 'See my words' },
  },
  {
    id: 'pick',
    text: 'Pick 5 words you want to learn first',
    detail: 'Choose ones you say every day, not the fanciest ones.',
  },
  {
    id: 'aloud',
    text: 'Read one of your replies out loud',
    detail: 'Hearing how you naturally talk makes your habits easier to spot.',
  },
  {
    id: 'daily',
    text: 'Come back tomorrow for another chat',
    detail: 'A few minutes every day beats an hour once a week.',
  },
]
