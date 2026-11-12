import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

export interface CandidateQueue {
  send(body: string): Promise<void>;
}

export function createSqsCandidateQueue(
  queueUrl: string,
  client: SQSClient = new SQSClient({}),
): CandidateQueue {
  return {
    async send(body: string): Promise<void> {
      await client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: body,
        }),
      );
    },
  };
}
