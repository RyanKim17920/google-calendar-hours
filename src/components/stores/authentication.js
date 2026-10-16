import { createSlice } from '@reduxjs/toolkit';

export const authentication = createSlice({
  name: 'authentication',
  initialState: null,
  reducers: {},
});

export const selectAccessToken = (state) => state.authentication.accessToken;
export const selectHasToken = (state) => Boolean(selectAccessToken(state));
export const selectAuthError = (state) => state.authentication.error ?? null;

export default authentication.reducer;
