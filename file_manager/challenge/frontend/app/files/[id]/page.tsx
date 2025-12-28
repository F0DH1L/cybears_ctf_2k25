"use client"
import { useState, useEffect } from 'react';
import { fileService } from '@/lib/api';

export default function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [successMessage, setSuccessMessage] = useState<string>('');

  const fetchFiles = async () => {
    try {
      const { id } = await params
      const decodedId = decodeURIComponent(id)
      const response1 = await fileService.getFile(decodedId)
      let content;
      let filename;
      let response;

      if (typeof response1 !== 'object') {
        response = JSON.parse(response1)
        content = response.content
        filename = response.filename
      }
      else {
        content = response1.content
        filename = response1.filename
      }
      const response2 = await fileService.updateVisits(filename, content)
      setSuccessMessage(response2.message)
    } catch (error) {
      console.error('Failed to fetch files', error);
    }
  };

  useEffect(() => {
    fetchFiles();
  })

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">File Manager</h1>
      <h2>Here is the filename</h2>
      <br />
      <div dangerouslySetInnerHTML={{ __html: successMessage }}>

      </div>
      <h2>And here is the content of your file 
        <br/>
        <span className='text-red-500'>NOTE: you wont see the content for now we are still testing for vulnerabilities here</span></h2>
    </div>
  );
}