// pages/api/logs.js
export const config = {
    runtime: 'nodejs',
    // Disable Vercel protection for this endpoint
  }
  
  // Add CORS headers to make it publicly accessible
  function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  
let routingLogs = [];
export default function handler(req, res) {
       setCorsHeaders(res);

  if (req.method === 'GET') {
    // Return logs as HTML page
    const html = generateLogsHTML(routingLogs);
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
  }
  
  if (req.method === 'POST') {
    // Add new log entry
    const logEntry = {
      ...req.body,
      timestamp: new Date().toISOString(),
      id: Date.now()
    };
    
    routingLogs.unshift(logEntry); // Add to beginning
    routingLogs = routingLogs.slice(0, 50); // Keep last 50 entries
    
    return res.status(200).json({ logged: true });
  }
  
  if (req.method === 'DELETE') {
    // Clear logs
    routingLogs = [];
    return res.status(200).json({ cleared: true });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}

function generateLogsHTML(logs) {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>Prover AI Routing Logs</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .log-entry { animation: slideIn 0.3s ease-out; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .command-enrich { border-left: 4px solid #10b981; }
        .command-search { border-left: 4px solid #3b82f6; }
        .command-upsert { border-left: 4px solid #f59e0b; }
        .command-conversation { border-left: 4px solid #6b7280; }
    </style>
    <script>
        function autoRefresh() {
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        }
        
        function clearLogs() {
            fetch('/api/logs', { method: 'DELETE' })
                .then(() => window.location.reload());
        }
        
        // Auto-refresh every 2 seconds
        setInterval(() => {
            fetch('/api/logs')
                .then(response => response.text())
                .then(html => {
                    document.documentElement.innerHTML = html;
                });
        }, 2000);
    </script>
</head>
<body class="bg-gray-100 p-4">
    <div class="max-w-6xl mx-auto">
        <div class="bg-white rounded-lg shadow-lg p-6">
            <div class="flex justify-between items-center mb-6">
                <h1 class="text-2xl font-bold text-gray-800">🤖 AI Routing Intelligence</h1>
                <div class="flex gap-2">
                    <span class="text-sm text-gray-500">Auto-refresh: 2s</span>
                    <button onclick="clearLogs()" class="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600">
                        Clear Logs
                    </button>
                </div>
            </div>
            
            ${logs.length === 0 ? 
                '<div class="text-center text-gray-500 py-12">No routing logs yet. Start using the chat to see AI decision-making in real-time.</div>' : 
                logs.map(log => generateLogEntryHTML(log)).join('')
            }
        </div>
    </div>
</body>
</html>`;
}

function generateLogEntryHTML(log) {
  const commandClass = `command-${log.command_type || 'conversation'}`;
  const timestamp = new Date(log.timestamp).toLocaleTimeString();
  
  return `
    <div class="log-entry ${commandClass} bg-gray-50 border rounded-lg p-4 mb-4">
        <div class="flex justify-between items-start mb-3">
            <div class="flex items-center gap-3">
                <span class="font-mono text-sm bg-white px-2 py-1 rounded border">
                    ${log.command_type || 'conversation'}
                </span>
                <span class="text-gray-500 text-sm">${timestamp}</span>
            </div>
            ${log.prover_score ? 
                `<span class="bg-green-100 text-green-800 px-2 py-1 rounded text-sm font-medium">
                    Score: ${log.prover_score}/100
                </span>` : ''
            }
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <!-- Input & Intent -->
            <div class="bg-white p-3 rounded border">
                <h4 class="font-medium text-gray-700 mb-2">📥 Input → Intent</h4>
                <p class="text-sm font-mono bg-gray-100 p-2 rounded mb-2">${log.input}</p>
                <div class="text-xs">
                    <div><span class="text-gray-600">Detected:</span> <span class="font-medium text-green-600">${log.command_type}</span></div>
                    ${log.extracted_params ? 
                        `<div class="mt-1"><span class="text-gray-600">Params:</span> 
                         <div class="font-mono text-xs bg-blue-50 p-1 rounded mt-1">${JSON.stringify(log.extracted_params, null, 1)}</div></div>` : ''
                    }
                </div>
            </div>
            
            <!-- Data Sources -->
            <div class="bg-white p-3 rounded border">
                <h4 class="font-medium text-gray-700 mb-2">🗄️ Data Sources</h4>
                ${log.data_queries ? generateDataSourcesHTML(log.data_queries) : '<div class="text-xs text-gray-500">No data queries</div>'}
            </div>
            
            <!-- System Routing -->
            <div class="bg-white p-3 rounded border">
                <h4 class="font-medium text-gray-700 mb-2">⚙️ System Routing</h4>
                <div class="text-xs space-y-1">
                    <div><span class="text-gray-600">Prompt:</span> <span class="font-mono text-blue-600">${log.system_prompt_file || 'default'}</span></div>
                    <div><span class="text-gray-600">Temperature:</span> <span class="font-mono">${log.temperature || 0.7}</span></div>
                    <div><span class="text-gray-600">Tokens:</span> <span class="font-mono">${log.max_tokens || 1000}</span></div>
                    <div><span class="text-gray-600">Format:</span> <span class="font-mono">${log.output_format}</span></div>
                </div>
            </div>
            
            <!-- Output -->
            <div class="bg-white p-3 rounded border">
                <h4 class="font-medium text-gray-700 mb-2">📤 Structured Output</h4>
                <div class="text-xs">
                    ${log.company_name ? 
                        `<div><span class="text-gray-600">Company:</span> <span class="font-medium">${log.company_name}</span></div>` : ''
                    }
                    ${log.response_length ? 
                        `<div><span class="text-gray-600">Length:</span> <span class="font-mono">${log.response_length} chars</span></div>` : ''
                    }
                    <div class="mt-2 text-xs text-gray-500 bg-gray-100 p-2 rounded max-h-20 overflow-y-auto">
                        ${log.response_preview || 'Processing...'}
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Data Query Details -->
        ${log.data_queries && log.data_queries.length > 0 ? 
            `<div class="mt-4 bg-white border rounded p-3">
                <h4 class="font-medium text-gray-700 mb-3">🔍 Data Pipeline: Prose → Intent → Queries → Results</h4>
                <div class="space-y-3">
                    ${log.data_queries.map(query => generateQueryHTML(query)).join('')}
                </div>
            </div>` : ''
        }
    </div>`;
}

function generateDataSourcesHTML(dataQueries) {
  if (!dataQueries || dataQueries.length === 0) {
    return '<div class="text-xs text-gray-500">No data accessed</div>';
  }
  
  const internal = dataQueries.filter(q => q.source_type === 'internal');
  const external = dataQueries.filter(q => q.source_type === 'external');
  
  return `
    <div class="space-y-2">
      ${internal.length > 0 ? `
        <div>
          <div class="text-xs font-medium text-green-700 mb-1">📁 Internal</div>
          ${internal.map(q => `<div class="text-xs bg-green-50 text-green-700 px-2 py-1 rounded mb-1">${q.source_name}</div>`).join('')}
        </div>
      ` : ''}
      
      ${external.length > 0 ? `
        <div>
          <div class="text-xs font-medium text-blue-700 mb-1">🌐 External</div>
          ${external.map(q => `<div class="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded mb-1">${q.source_name}</div>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function generateQueryHTML(query) {
  const sourceIcon = {
    'internal': '📁',
    'external': '🌐', 
    'llm_training': '🧠',
    'hybrid': '🔗'
  }[query.source_type] || '📄';
  
  const statusColor = {
    'success': 'text-green-600',
    'error': 'text-red-600', 
    'inferred': 'text-purple-600',
    'synthesized': 'text-orange-600',
    'simulated': 'text-yellow-600'
  }[query.status] || 'text-gray-600';
  
  const confidenceColor = {
    'verified': 'bg-green-100 text-green-800',
    'high_confidence': 'bg-blue-100 text-blue-800',
    'medium_confidence': 'bg-yellow-100 text-yellow-800',
    'low_confidence': 'bg-orange-100 text-orange-800',
    'synthetic': 'bg-red-100 text-red-800',
    'mixed': 'bg-purple-100 text-purple-800',
    'failed': 'bg-gray-100 text-gray-800'
  }[query.confidence] || 'bg-gray-100 text-gray-600';
  
  return `
    <div class="border rounded p-3 bg-gray-50">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <span>${sourceIcon}</span>
          <span class="font-medium text-sm">${query.source_name}</span>
          <span class="text-xs bg-gray-200 px-2 py-1 rounded">${query.operation}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs ${confidenceColor} px-2 py-1 rounded font-medium">${query.confidence}</span>
          <span class="text-xs ${statusColor} font-medium">${query.status}</span>
        </div>
      </div>
      
      ${query.logical_query ? `
        <div class="mb-2">
          <span class="text-xs text-gray-600">Intent → Logic:</span>
          <div class="font-mono text-xs bg-blue-50 p-2 rounded mt-1">${query.logical_query}</div>
        </div>
      ` : ''}
      
      ${query.actual_query ? `
        <div class="mb-2">
          <span class="text-xs text-gray-600">Executed Query:</span>
          <div class="font-mono text-xs bg-yellow-50 p-2 rounded mt-1">${query.actual_query}</div>
        </div>
      ` : ''}
      
      ${query.result_summary ? `
        <div class="mb-2">
          <span class="text-xs text-gray-600">Result:</span>
          <div class="text-xs bg-green-50 p-2 rounded mt-1">${query.result_summary}</div>
        </div>
      ` : ''}
      
      ${query.source_breakdown ? `
        <div class="mb-2">
          <span class="text-xs text-gray-600">Source Breakdown:</span>
          <div class="flex flex-wrap gap-1 mt-1">
            ${query.source_breakdown.map(source => 
              `<span class="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded">${source}</span>`
            ).join('')}
          </div>
        </div>
      ` : ''}
      
      ${query.source_type === 'hybrid' || query.confidence === 'synthetic' ? `
        <div class="mt-2 p-2 bg-amber-50 border border-amber-200 rounded">
          <div class="text-xs text-amber-800">
            <strong>⚠️ Data Transparency:</strong> 
            ${query.confidence === 'synthetic' ? 
              'Contains synthetic demo data - not real contact information' : 
              'Combines verified data with AI inference - review confidence levels'
            }
          </div>
        </div>
      ` : ''}
    </div>
  `;
}