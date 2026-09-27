// Mai's side of the chat. Every line but the last expects a reply from the user.
export const MAI_SCRIPT: string[] = [
  "Hey! It's been a while. How've you been?",
  'Nice. So what have you been up to lately? Walk me through your week.',
  'Ha, sounds like a lot. Anything happen that really got on your nerves?',
  "Ugh, I'd be annoyed too. What did you end up doing about it?",
  "Okay, something better now. What's something you're actually looking forward to?",
  "Oh, that sounds fun! How'd that come about?",
  'By the way, have you watched or played anything good lately? I need recommendations.',
  'Wait, why do you like it so much? Sell me on it.',
  'Okay, I might have to check it out. Hey, got any funny stories lately? Or something embarrassing?',
  'No way! What did everyone else do?',
  'Honestly, how are you doing overall? Anything stressing you out?',
  'Yeah, that makes sense. What are you leaning towards?',
  "Well, I'm glad we caught up. Anything else going on before I let you go?",
  'Okay, talk soon! Take care.',
]

export const QUESTION_COUNT = MAI_SCRIPT.length - 1
