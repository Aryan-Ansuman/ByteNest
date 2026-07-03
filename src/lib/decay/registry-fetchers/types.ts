export type ReleaseHistoryEntry = {
  version: string;
  date: string; // ISO 8601
};

export type NormalizedRelease = {
  latestVersion: string;
  latestMajorVersion: number;
  latestReleaseDate: string; // ISO 8601
  releaseHistory: ReleaseHistoryEntry[]; // most recent 10, descending by date
};

export class RegistryFetchError extends Error {
  constructor(
    message: string,
    public readonly ecosystem: string,
    public readonly packageName: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "RegistryFetchError";
  }
}
