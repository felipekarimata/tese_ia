import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { PipelineStatusResponse, PipelineOperation } from '@/lib/pipeline/types';
import { jsonNoStore } from '@/lib/json-no-store-response';

export const dynamic = 'force-dynamic';

/**
 * Find the most recent running job ID for a given operation and document
 */
async function findCurrentOperationJobId(
  operation: PipelineOperation,
  documentId: string
): Promise<string | undefined> {
  try {
    let tableName: string;
    let statusField = 'status';
    let runningStatuses: string[];

    switch (operation) {
      case 'improve':
        tableName = 'improvement_jobs';
        runningStatuses = ['pending', 'analyzing'];
        break;
      case 'translate':
        tableName = 'translation_jobs';
        runningStatuses = ['pending', 'translating'];
        break;
      case 'adjust':
        tableName = 'adjust_jobs';
        runningStatuses = ['pending', 'adjusting'];
        break;
      case 'adapt':
        tableName = 'adapt_jobs';
        runningStatuses = ['pending', 'adapting'];
        break;
      case 'update':
        tableName = 'norm_update_jobs';
        runningStatuses = ['pending', 'analyzing'];
        break;
      default:
        return undefined;
    }

    const { data } = await supabase
      .from(tableName)
      .select('id')
      .eq('document_id', documentId)
      .in(statusField, runningStatuses)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return data?.id;
  } catch (error: any) {
    console.error(`[PIPELINE] Error finding ${operation} job ID:`, error);
    return undefined;
  }
}

/**
 * Get real-time progress from a sub-operation job
 */
async function getOperationProgress(
  operation: PipelineOperation,
  operationJobId: string
): Promise<{ percentage: number; message?: string } | null> {
  try {
    switch (operation) {
      case 'improve': {
        const { data: improveJob } = await supabase
          .from('improvement_jobs')
          .select('progress_percentage, status, current_section, total_sections')
          .eq('id', operationJobId)
          .single();

        if (!improveJob) return null;

        const percentage = improveJob.progress_percentage || 0;
        const message =
          improveJob.status === 'analyzing' && improveJob.total_sections > 0
            ? `Lendo trecho ${improveJob.current_section + 1} de ${improveJob.total_sections}`
            : improveJob.status === 'analyzing'
              ? 'Analisando o documento…'
              : undefined;

        return { percentage, message };
      }

      case 'translate': {
        const { data: translateJob } = await supabase
          .from('translation_jobs')
          .select('progress_percentage, status, current_chunk, total_chunks')
          .eq('id', operationJobId)
          .single();

        if (!translateJob) return null;

        const percentage = translateJob.progress_percentage || 0;
        const message =
          translateJob.status === 'translating' && translateJob.total_chunks > 0
            ? `Traduzindo parte ${translateJob.current_chunk + 1} de ${translateJob.total_chunks}`
            : translateJob.status === 'translating'
              ? 'Traduzindo…'
              : undefined;

        return { percentage, message };
      }

      case 'adjust': {
        const { data: adjustJob } = await supabase
          .from('adjust_jobs')
          .select('progress_percentage, status, current_section, total_sections')
          .eq('id', operationJobId)
          .single();

        if (!adjustJob) return null;

        const percentage = adjustJob.progress_percentage || 0;
        const message =
          adjustJob.status === 'adjusting' && adjustJob.total_sections > 0
            ? `Aplicando ajustes — trecho ${adjustJob.current_section + 1} de ${adjustJob.total_sections}`
            : adjustJob.status === 'adjusting'
              ? 'Aplicando ajustes…'
              : undefined;

        return { percentage, message };
      }

      case 'adapt': {
        const { data: adaptJob } = await supabase
          .from('adapt_jobs')
          .select('progress_percentage, status, current_section, total_sections')
          .eq('id', operationJobId)
          .single();

        if (!adaptJob) return null;

        const percentage = adaptJob.progress_percentage || 0;
        const message =
          adaptJob.status === 'adapting' && adaptJob.total_sections > 0
            ? `Adaptando o texto — trecho ${adaptJob.current_section + 1} de ${adaptJob.total_sections}`
            : adaptJob.status === 'adapting'
              ? 'Adaptando o texto…'
              : undefined;

        return { percentage, message };
      }

      case 'update': {
        const { data: updateJob } = await supabase
          .from('norm_update_jobs')
          .select(
            'progress_percentage, status, current_reference, total_references'
          )
          .eq('id', operationJobId)
          .single();

        if (!updateJob) return null;

        const percentage = updateJob.progress_percentage || 0;
        const total = updateJob.total_references || 0;
        const current = updateJob.current_reference || 0;
        const message =
          updateJob.status === 'analyzing' && total > 0
            ? `Verificando citação ${current} de ${total}`
            : updateJob.status === 'analyzing'
              ? 'Verificando leis e normas…'
              : undefined;

        return { percentage, message };
      }

      default:
        return null;
    }
  } catch (error: any) {
    console.error(`[PIPELINE] Error fetching ${operation} progress:`, error);
    return null;
  }
}

/**
 * GET /api/pipeline/[id]
 * Get pipeline status and progress
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    // Load pipeline job
    const { data: job, error: jobError } = await supabase
      .from('pipeline_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return jsonNoStore({ error: 'Pipeline job not found' }, { status: 404 });
    }

    // Load intermediate documents
    const { data: intermediateDocuments, error: docsError } = await supabase
      .from('pipeline_intermediate_documents')
      .select('*')
      .eq('pipeline_job_id', jobId)
      .order('operation_index', { ascending: true });

    if (docsError) {
      console.error('[PIPELINE] Error loading intermediate documents:', docsError);
    }

    // Get real-time progress from current sub-operation
    let currentOperationProgress: PipelineStatusResponse['currentOperationProgress'] = undefined;

    if (job.status === 'running' && job.current_operation_index < job.selected_operations.length) {
      const currentOperation = job.selected_operations[job.current_operation_index];
      
      // Try to get operationJobId from operation_results first
      let operationJobId: string | undefined = job.operation_results?.find(
        (r: any) => r.operationIndex === job.current_operation_index
      )?.operationJobId;

      // If not found in results (operation still running), try to find the most recent job
      if (!operationJobId) {
        operationJobId = await findCurrentOperationJobId(
          currentOperation,
          job.document_id
        );
      }

      if (operationJobId) {
        try {
          const progress = await getOperationProgress(
            currentOperation,
            operationJobId
          );

          if (progress) {
            currentOperationProgress = {
              operation: currentOperation,
              percentage: progress.percentage,
              message: progress.message
            };
          }
        } catch (error: any) {
          console.error(`[PIPELINE] Error fetching progress for ${currentOperation}:`, error);
          // Continue without progress if fetch fails
        }
      }
    }

    // Build response
    const response: PipelineStatusResponse = {
      job,
      intermediateDocuments: intermediateDocuments || [],
      currentOperationProgress
    };

    return jsonNoStore(response);
  } catch (error: any) {
    console.error('[PIPELINE] Error:', error);
    return jsonNoStore({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/pipeline/[id]
 * Cancel a running pipeline
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    // Update status to cancelled
    const { error } = await supabase
      .from('pipeline_jobs')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId)
      .in('status', ['pending', 'running', 'paused']);

    if (error) {
      console.error('[PIPELINE] Error cancelling job:', error);
      return NextResponse.json(
        { error: 'Failed to cancel pipeline' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Pipeline cancelled successfully' });

  } catch (error: any) {
    console.error('[PIPELINE] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/pipeline/[id]
 * Update pipeline (pause/resume)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const { action }: { action: 'pause' | 'resume' } = await req.json();

    if (!action || !['pause', 'resume'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "pause" or "resume"' },
        { status: 400 }
      );
    }

    const newStatus = action === 'pause' ? 'paused' : 'running';

    const { error } = await supabase
      .from('pipeline_jobs')
      .update({ status: newStatus })
      .eq('id', jobId);

    if (error) {
      console.error('[PIPELINE] Error updating job:', error);
      return NextResponse.json(
        { error: `Failed to ${action} pipeline` },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: `Pipeline ${action}d successfully` });

  } catch (error: any) {
    console.error('[PIPELINE] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
