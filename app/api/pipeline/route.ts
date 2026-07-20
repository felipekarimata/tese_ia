import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { randomUUID } from 'crypto';
import {
  CreatePipelineRequest,
  CreatePipelineResponse,
  PipelineOperation,
  OperationConfigs
} from '@/lib/pipeline/types';
import { startPipelineExecution } from '@/lib/pipeline/engine';

/**
 * POST /api/pipeline
 * Create and start a new pipeline
 */
export async function POST(req: NextRequest) {
  try {
    const body: CreatePipelineRequest = await req.json();
    const { documentId, operations, configs } = body;

    // Validation
    if (!documentId || !operations || operations.length === 0) {
      return NextResponse.json(
        { error: 'documentId and operations are required' },
        { status: 400 }
      );
    }

    // Verify document exists
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, title')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Validate operations
    const validOperations: PipelineOperation[] = ['adjust', 'update', 'improve', 'adapt', 'translate'];
    for (const op of operations) {
      if (!validOperations.includes(op)) {
        return NextResponse.json(
          { error: `Invalid operation: ${op}` },
          { status: 400 }
        );
      }
    }

    // Create pipeline job
    const jobId = randomUUID();
    const { error: insertError } = await supabase
      .from('pipeline_jobs')
      .insert({
        id: jobId,
        document_id: documentId,
        selected_operations: operations,
        operation_configs: configs || {},
        status: 'pending',
        current_operation_index: 0,
        operation_results: [],
        total_cost_usd: 0,
        created_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('[PIPELINE] Error creating job:', insertError);
      return NextResponse.json(
        { error: 'Failed to create pipeline job' },
        { status: 500 }
      );
    }

    console.log(`[PIPELINE] Created job ${jobId} for document ${documentId}`);
    console.log(`[PIPELINE] Operations: ${operations.join(' → ')}`);

    // Start execution in background
    startPipelineExecution(jobId);

    const response: CreatePipelineResponse = {
      jobId,
      message: 'Pipeline started successfully'
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[PIPELINE] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
