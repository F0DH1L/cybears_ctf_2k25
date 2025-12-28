import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-4">Welcome to File Manager</h1>
      <p className="text-xl mb-8 text-center">
        Securely manage your files with our simple web application
      </p>
      <div className="flex space-x-4">
        <Link 
          href="/login" 
          className="bg-blue-500 text-white px-6 py-3 rounded hover:bg-blue-600"
        >
          Login
        </Link>
        <Link 
          href="/register" 
          className="bg-green-500 text-white px-6 py-3 rounded hover:bg-green-600"
        >
          Register
        </Link>
      </div>
    </main>
  )
}