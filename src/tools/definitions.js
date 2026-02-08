export const toolDefinitions = [
  {
    type: 'function',
    name: 'get_channel_history',
    description:
      'Fetch recent messages from the current Discord channel. Use this when you need conversational context to understand what people are talking about.',
    parameters: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of recent messages to fetch (1-30). Defaults to 15.',
        },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'get_reply_chain',
    description:
      'Walk the reply chain of the message that triggered this conversation. Use this when the user is replying to an earlier message and you need to see what they are replying to.',
    parameters: {
      type: 'object',
      properties: {
        max_depth: {
          type: 'number',
          description: 'How many replies to walk back (1-10). Defaults to 5.',
        },
      },
      required: [],
    },
  },
];
