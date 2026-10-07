import type { OpBody, ServerData, Settings } from './types';

// Network trouble: keep the entry and try again later
export class NetworkError extends Error {}
// The server answered "no": retrying the same request won't help
export class ServerError extends Error {}

interface ApiResponse {
  ok: boolean;
  error?: string;
  id?: string;
  data?: ServerData;
}

export async function callApi(
  settings: Settings,
  body: OpBody | { action: 'data' },
  timeoutMs = 25000,
): Promise<ServerData> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    // text/plain keeps this a "simple" request, so Apps Script needs no CORS preflight
    res = await fetch(settings.url, {
      method: 'POST',
      body: JSON.stringify({ key: settings.key, ...body }),
      signal: ctrl.signal,
      redirect: 'follow',
    });
  } catch (err) {
    throw new NetworkError(
      err instanceof Error && err.name === 'AbortError'
        ? 'The sheet took too long to answer'
        : 'No connection',
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new NetworkError(`The sheet answered ${res.status}`);

  let json: ApiResponse;
  try {
    json = (await res.json()) as ApiResponse;
  } catch {
    throw new ServerError('The web app URL looks wrong: it returned a page instead of data');
  }
  if (!json.ok || !json.data) {
    const msg =
      json.error === 'unauthorized'
        ? 'The access key doesn’t match VIEW_KEY in the script'
        : json.error || 'Unknown error';
    throw new ServerError(msg);
  }
  return json.data;
}
