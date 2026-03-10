import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

// GET - Get chat messages for a document
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const messages = await db.chatMessage.findMany({
      where: { documentId: id },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(messages);
  } catch (error) {
    console.error('Failed to fetch chat messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chat messages' },
      { status: 500 }
    );
  }
}

// POST - Send a message and get AI response
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const userMessage = body.message;

    if (!userMessage || typeof userMessage !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Get the document
    const document = await db.document.findUnique({
      where: { id },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    if (!document.content) {
      return NextResponse.json(
        { error: 'Document has no content' },
        { status: 400 }
      );
    }

    // Get previous chat history
    const previousMessages = await db.chatMessage.findMany({
      where: { documentId: id },
      orderBy: { createdAt: 'asc' },
      take: 10, // Limit context to last 10 messages
    });

    // Save user message
    const savedUserMessage = await db.chatMessage.create({
      data: {
        documentId: id,
        role: 'user',
        content: userMessage,
      },
    });

    try {
      // Initialize ZAI SDK
      const zai = await ZAI.create();

      // Truncate content if too long
      const maxLength = 15000;
      const documentContent =
        document.content.length > maxLength
          ? document.content.substring(0, maxLength) +
            '\n\n[Content truncated...]'
          : document.content;

      // Build conversation history
      const conversationHistory = previousMessages.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      })) as Array<{ role: 'user' | 'assistant'; content: string }>;

      // Create the chat completion
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'assistant',
            content: `You are a helpful AI assistant that answers questions about documents. You have access to the document content and can provide accurate, relevant answers.

Guidelines:
- Answer questions based on the document content
- If the answer is not in the document, say so honestly
- Be concise but thorough
- Use markdown formatting for better readability
- If asked about specific sections, quote them when relevant
- Respond in the same language as the user's question (Thai or English)

Document: ${document.filename}
Type: ${document.fileType.toUpperCase()}

Document Content:
${documentContent}`,
          },
          ...conversationHistory,
          {
            role: 'user',
            content: userMessage,
          },
        ],
        thinking: { type: 'disabled' },
      });

      const assistantResponse = completion.choices[0]?.message?.content;

      if (!assistantResponse) {
        throw new Error('Failed to generate response');
      }

      // Save assistant message
      const savedAssistantMessage = await db.chatMessage.create({
        data: {
          documentId: id,
          role: 'assistant',
          content: assistantResponse,
        },
      });

      return NextResponse.json({
        userMessage: savedUserMessage,
        assistantMessage: savedAssistantMessage,
      });
    } catch (aiError) {
      // Delete the user message if AI fails
      await db.chatMessage.delete({
        where: { id: savedUserMessage.id },
      });
      throw aiError;
    }
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to process message',
      },
      { status: 500 }
    );
  }
}

// DELETE - Clear chat history
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.chatMessage.deleteMany({
      where: { documentId: id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to clear chat:', error);
    return NextResponse.json(
      { error: 'Failed to clear chat history' },
      { status: 500 }
    );
  }
}
