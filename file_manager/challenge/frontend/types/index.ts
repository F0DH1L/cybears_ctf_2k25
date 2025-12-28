export interface User {
    username: string;
    id?: number;
    admin?: boolean;
  }
  
  export interface File {
    filename: string;
    content?: string;
  }