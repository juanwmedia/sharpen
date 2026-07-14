const GITHUB_BASE_URL = 'https://github.com'
const AVATAR_SIZE_PX = 48

export function githubProfileUrl(login: string): string {
  return `${GITHUB_BASE_URL}/${encodeURIComponent(login)}`
}

export function githubAvatarUrl(login: string): string {
  return `${GITHUB_BASE_URL}/${encodeURIComponent(login)}.png?size=${AVATAR_SIZE_PX}`
}
