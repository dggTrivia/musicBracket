// Dormant transport boundary. No sockets, credentials, network listeners or chat UI start at boot.
export const CHAT_VOTING_ENABLED = false;
export interface ChatVote {
  voterId: string;
  matchId: string;
  songId: string;
  receivedAt: number;
}
export interface ChatTransport {
  connect(
    sessionId: string,
    onVote: (vote: ChatVote) => void,
  ): Promise<() => void>;
}
export class VoteWindow {
  private votes = new Map<string, ChatVote>();
  constructor(
    readonly matchId: string,
    readonly songIds: readonly string[],
    readonly openedAt: number,
    readonly closesAt: number,
  ) {}
  accept(vote: ChatVote) {
    if (
      vote.matchId !== this.matchId ||
      !this.songIds.includes(vote.songId) ||
      !vote.voterId ||
      vote.receivedAt < this.openedAt ||
      vote.receivedAt > this.closesAt
    )
      return false;
    this.votes.set(vote.voterId, vote);
    return true;
  }
  tally() {
    return Object.fromEntries(
      this.songIds.map((id) => [
        id,
        [...this.votes.values()].filter((v) => v.songId === id).length,
      ]),
    );
  }
}
