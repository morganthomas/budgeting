const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  auth: {
    register: (username: string, password: string) =>
      request<{ user: User; token: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    login: (username: string, password: string) =>
      request<{ user: User; token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    me: () => request<{ user: User }>('/auth/me'),
  },
  currencies: {
    list: () => request<{ currencies: Currency[]; exchange_rates: ExchangeRate[] }>('/currencies'),
    create: (data: { code: string; name: string }) =>
      request<Currency>('/currencies', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ code: string; name: string }>) =>
      request<Currency>(`/currencies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/currencies/${id}`, { method: 'DELETE' }),
    setRate: (fromId: string, toId: string, rate: number) =>
      request<ExchangeRate>(`/currencies/rates/${fromId}/${toId}`, {
        method: 'PUT',
        body: JSON.stringify({ rate }),
      }),
    deleteRate: (fromId: string, toId: string) =>
      request(`/currencies/rates/${fromId}/${toId}`, { method: 'DELETE' }),
  },
  accounts: {
    list: () => request<Account[]>('/accounts'),
    get: (id: string) => request<Account>(`/accounts/${id}`),
    create: (data: { name: string; currency_id: string; start_balance?: number }) =>
      request<Account>('/accounts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ name: string; start_balance: number }>) =>
      request<Account>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/accounts/${id}`, { method: 'DELETE' }),
  },
  transactions: {
    list: (accountId: string) =>
      request<Transaction[]>(`/transactions/account/${accountId}`),
    create: (accountId: string, data: { timestamp: string; counterparty: string; amount: number }) =>
      request<Transaction>(`/transactions/account/${accountId}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<{ timestamp: string; counterparty: string; amount: number }>) =>
      request<Transaction>(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/transactions/${id}`, { method: 'DELETE' }),
  },
};

export interface User {
  id: string;
  username: string;
}

export interface Currency {
  id: string;
  code: string;
  name: string;
}

export interface ExchangeRate {
  id: string;
  from_currency_id: string;
  to_currency_id: string;
  from_code: string;
  to_code: string;
  rate: string;
  updated_at: string;
}

export interface Account {
  id: string;
  name: string;
  currency_id: string;
  currency_code: string;
  currency_name: string;
  start_balance: string;
  current_balance: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  account_id: string;
  timestamp: string;
  counterparty: string;
  amount: string;
  created_at: string;
}
