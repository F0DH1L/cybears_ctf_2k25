'use client';

import { useState, useEffect } from 'react';
import { fileService } from '@/lib/api';
import { File } from '@/types';
import Link from 'next/link';

export default function FileManager() {
  const [files, setFiles] = useState<File[]>([]);
  const [newFileContent, setNewFileContent] = useState('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const response = await fileService.getAllFiles();
      setFiles(response.files.map((filename:string) => ({ filename })));
    } catch (error) {
      console.error('Failed to fetch files', error);
    }
  };

  const handleCreateFile = async () => {
    try {
      const response = await fileService.createFile(newFileContent);
      fetchFiles();
      setNewFileContent('');
      if (response.message) {
        console.log(response.message.message);
        setErrorMessage(response.message.message);
      } 
    } catch (error) {
      console.error('Failed to create file', error);
    }
  };

  const handleViewFile = async (filename: string) => {
    try {
      await fileService.getFile(filename);
    } catch (error) {
      console.error('Failed to view file', error);
    }
  };

  const handleDeleteFile = async (filename: string) => {
    try {
      await fileService.deleteFile(filename);
      fetchFiles();
    } catch (error) {
      console.error('Failed to delete file', error);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">File Manager</h1>
      
      <div className=" gap-4">
        <div>
          <h2 className="text-xl font-semibold mb-2">Create New File</h2>
          <textarea
            className="w-full p-2 border rounded"
            placeholder="Enter file content"
            value={newFileContent}
            onChange={(e) => setNewFileContent(e.target.value)}
            rows={4}
          />
          <button
            onClick={handleCreateFile}
            className="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Create File
          </button>

          {errorMessage && (
            <div className="mt-2 text-red-500 text-2xl font-bold">
              {errorMessage}
            </div>
          )}

          <h2 className="text-xl font-semibold mt-4 mb-2">Your Files</h2>
          <ul className="border rounded">
            {files.map((file) => (
              <li 
                key={file.filename} 
                className="p-2 border-b flex justify-between items-center"
              >
                <span 
                  onClick={() => handleViewFile(file.filename)}
                  className="cursor-pointer hover:text-blue-500"
                >
                  {file.filename}
                </span>
                <div className='flex gap-5'>

                <Link href={`/files/${file.filename}`} className=" hover:text-gray-300">
                View
              </Link>
                <button
                  onClick={() => handleDeleteFile(file.filename)}
                  className="text-red-500 hover:text-red-700"
                  >
                  Delete
                </button>
                    </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}