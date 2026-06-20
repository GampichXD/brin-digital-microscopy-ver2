export interface LoginResponse {
  access_token: string;
  token_type: string;
  username: string;
  role: 'ADMIN' | 'OPERATOR';
}