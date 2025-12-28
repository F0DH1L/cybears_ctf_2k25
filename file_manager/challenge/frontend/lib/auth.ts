import Cookies from 'js-cookie';

export const isAuthenticated = () => {
  console.log('Checking if user is authenticated');
  console.log(Cookies);
  console.log('Session cookie:', !!Cookies.get('session'));
  return !!Cookies.get('session');
};

export const setAuthCookie = (token: string) => {
  Cookies.set('session', token, { expires: 7 }); // 7 days expiration
};