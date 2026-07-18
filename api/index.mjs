import serverModule from '../server.js';

export default function handler(request, response) {
  const url = new URL(request.url, 'http://localhost');
  const route = url.searchParams.get('route');
  request.url = route ? `/api/${route}` : '/api/session';
  return serverModule.handleRequest(request, response);
}
