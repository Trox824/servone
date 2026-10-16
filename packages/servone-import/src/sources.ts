import { asanaConnector } from './connectors/asana'
import { clickupConnector } from './connectors/clickup'
import { confluenceConnector } from './connectors/confluence'
import { discordConnector } from './connectors/discord'
import { gdocsConnector } from './connectors/gdocs'
import { jiraConnector } from './connectors/jira'
import { linearConnector } from './connectors/linear'
import { mondayConnector } from './connectors/monday'
import { notionConnector } from './connectors/notion'
import { slackConnector } from './connectors/slack'
import { teamsConnector } from './connectors/teams'
import { trelloConnector } from './connectors/trello'
import { parseNotion } from './notion'
import { parseSlack } from './slack'
import { parseAsana } from './tracker/asana'
import { parseClickup } from './tracker/clickup'
import { parseJira } from './tracker/jira'
import { parseLinear } from './tracker/linear'
import { parseTrello } from './tracker/trello'
import type { Source } from './types'

export const sources: Source[] = [
  { id: 'linear', name: 'Linear', area: 'tracker', file: { accept: '.csv', parse: parseLinear }, connector: linearConnector },
  { id: 'clickup', name: 'ClickUp', area: 'tracker', file: { accept: '.csv', parse: parseClickup }, connector: clickupConnector },
  { id: 'jira', name: 'Jira', area: 'tracker', file: { accept: '.csv', parse: parseJira }, connector: jiraConnector },
  { id: 'asana', name: 'Asana', area: 'tracker', file: { accept: '.csv', parse: parseAsana }, connector: asanaConnector },
  { id: 'trello', name: 'Trello', area: 'tracker', file: { accept: '.json', parse: parseTrello }, connector: trelloConnector },
  { id: 'monday', name: 'Monday', area: 'tracker', connector: mondayConnector },
  { id: 'slack', name: 'Slack', area: 'chat', file: { accept: '.zip', parse: parseSlack }, connector: slackConnector },
  { id: 'teams', name: 'Microsoft Teams', area: 'chat', connector: teamsConnector },
  { id: 'discord', name: 'Discord', area: 'chat', connector: discordConnector },
  { id: 'notion', name: 'Notion', area: 'documents', file: { accept: '.zip', parse: parseNotion }, connector: notionConnector },
  { id: 'confluence', name: 'Confluence', area: 'documents', connector: confluenceConnector },
  { id: 'gdocs', name: 'Google Docs', area: 'documents', connector: gdocsConnector }
]
