/**
 * Graph Schema Definitions
 * Cypher queries and indexes for FalkorDB
 */

/**
 * Code-specific node and edge types
 */
export const CODE_NODE_TYPES = {
  FUNCTION: 'Function',
  CLASS: 'Class',
  INTERFACE: 'Interface',
  TYPE: 'Type',
  VARIABLE: 'Variable',
  CONSTANT: 'Constant',
  MODULE: 'Module',
  PACKAGE: 'Package',
  IMPORT: 'Import',
  EXPORT: 'Export',
  NAMESPACE: 'Namespace',
  ENUM: 'Enum',
  CONSTRUCTOR: 'Constructor',
  METHOD: 'Method',
  PROPERTY: 'Property'
} as const;

export const CODE_EDGE_TYPES = {
  CALLS: 'CALLS',
  IMPORTS: 'IMPORTS',
  EXPORTS: 'EXPORTS',
  INHERITS: 'INHERITS',
  IMPLEMENTS: 'IMPLEMENTS',
  DEPENDS_ON: 'DEPENDS_ON',
  DEFINES: 'DEFINES',
  USES: 'USES',
  MODIFIES: 'MODIFIES',
  CONTAINS: 'CONTAINS',
  REFERENCES: 'REFERENCES',
  EXTENDS: 'EXTENDS',
  OVERRIDES: 'OVERRIDES',
  INSTANTIATES: 'INSTANTIATES',
  THROWS: 'THROWS',
  RETURNS: 'RETURNS',
  PARAMETER_OF: 'PARAMETER_OF'
} as const;

/**
 * Node creation constraints and indexes
 */
export const GRAPH_SCHEMA = {
  // Create node type indexes
  indexes: [
    'CREATE INDEX ON :Concept(id)',
    'CREATE INDEX ON :Fact(id)',
    'CREATE INDEX ON :Event(id)',
    'CREATE INDEX ON :Entity(id)',
    'CREATE INDEX ON :Document(id)',
    'CREATE INDEX ON :Question(id)',
    'CREATE INDEX ON :Insight(id)',
    'CREATE INDEX ON :Memory(id)',
    
    // Code entity indexes
    'CREATE INDEX ON :Function(id)',
    'CREATE INDEX ON :Function(name)',
    'CREATE INDEX ON :Function(signature)',
    'CREATE INDEX ON :Class(id)',
    'CREATE INDEX ON :Class(name)',
    'CREATE INDEX ON :Interface(id)',
    'CREATE INDEX ON :Interface(name)',
    'CREATE INDEX ON :Module(id)',
    'CREATE INDEX ON :Module(name)',
    'CREATE INDEX ON :Module(path)',
    'CREATE INDEX ON :Variable(id)',
    'CREATE INDEX ON :Variable(name)',
    'CREATE INDEX ON :Type(id)',
    'CREATE INDEX ON :Type(name)',
    'CREATE INDEX ON :Package(id)',
    'CREATE INDEX ON :Package(name)',
    
    // Create property indexes for fast lookups
    'CREATE INDEX ON :Concept(name)',
    'CREATE INDEX ON :Entity(name)',
    'CREATE INDEX ON :Document(path)',
    'CREATE INDEX ON :Event(timestamp)',
    'CREATE INDEX ON :Memory(session_id)',
    'CREATE INDEX ON :Memory(user_id)',
    
    // Code-specific property indexes
    'CREATE INDEX ON :Function(file_path)',
    'CREATE INDEX ON :Class(file_path)',
    'CREATE INDEX ON :Module(file_path)',
    'CREATE INDEX ON :Function(language)',
    'CREATE INDEX ON :Class(language)',
    'CREATE INDEX ON :Function(complexity)',
    'CREATE INDEX ON :Function(line_count)',
    
    // Full-text search indexes
    'CREATE FULLTEXT INDEX conceptSearch ON :Concept(name, description)',
    'CREATE FULLTEXT INDEX factSearch ON :Fact(statement)',
    'CREATE FULLTEXT INDEX documentSearch ON :Document(title, content)',
    'CREATE FULLTEXT INDEX entitySearch ON :Entity(name, aliases)',
    'CREATE FULLTEXT INDEX codeSearch ON :Function,Class,Interface(name, signature, documentation)',
    'CREATE FULLTEXT INDEX moduleSearch ON :Module(name, path, description)',
  ],

  // Node templates
  nodeTemplates: {
    concept: `
      CREATE (n:Concept {
        id: $id,
        type: 'concept',
        name: $name,
        description: $description,
        created_at: datetime(),
        updated_at: datetime(),
        accessed_at: datetime(),
        access_count: 0,
        importance: $importance,
        confidence: $confidence,
        embedding: $embedding,
        synonyms: $synonyms,
        category: $category,
        tags: $tags,
        metadata: $metadata
      })
      RETURN n
    `,
    
    fact: `
      CREATE (n:Fact {
        id: $id,
        type: 'fact',
        statement: $statement,
        source: $source,
        evidence: $evidence,
        verified: $verified,
        created_at: datetime(),
        updated_at: datetime(),
        accessed_at: datetime(),
        access_count: 0,
        importance: $importance,
        confidence: $confidence,
        embedding: $embedding,
        validity_start: $validity_start,
        validity_end: $validity_end,
        metadata: $metadata
      })
      RETURN n
    `,
    
    event: `
      CREATE (n:Event {
        id: $id,
        type: 'event',
        name: $name,
        description: $description,
        timestamp: datetime($timestamp),
        duration: $duration,
        participants: $participants,
        location: $location,
        outcome: $outcome,
        created_at: datetime(),
        updated_at: datetime(),
        accessed_at: datetime(),
        access_count: 0,
        importance: $importance,
        confidence: $confidence,
        embedding: $embedding,
        metadata: $metadata
      })
      RETURN n
    `,
    
    entity: `
      CREATE (n:Entity {
        id: $id,
        type: 'entity',
        name: $name,
        entity_type: $entity_type,
        attributes: $attributes,
        aliases: $aliases,
        created_at: datetime(),
        updated_at: datetime(),
        accessed_at: datetime(),
        access_count: 0,
        importance: $importance,
        confidence: $confidence,
        embedding: $embedding,
        metadata: $metadata
      })
      RETURN n
    `,
    
    document: `
      CREATE (n:Document {
        id: $id,
        type: 'document',
        title: $title,
        content: $content,
        path: $path,
        author: $author,
        summary: $summary,
        keywords: $keywords,
        language: $language,
        created_at: datetime(),
        updated_at: datetime(),
        accessed_at: datetime(),
        access_count: 0,
        importance: $importance,
        confidence: $confidence,
        embedding: $embedding,
        metadata: $metadata
      })
      RETURN n
    `,
    
    question: `
      CREATE (n:Question {
        id: $id,
        type: 'question',
        question: $question,
        context: $context,
        answered: $answered,
        answer_nodes: $answer_nodes,
        asked_by: $asked_by,
        created_at: datetime(),
        updated_at: datetime(),
        accessed_at: datetime(),
        access_count: 0,
        importance: $importance,
        confidence: $confidence,
        embedding: $embedding,
        metadata: $metadata
      })
      RETURN n
    `,
    
    insight: `
      CREATE (n:Insight {
        id: $id,
        type: 'insight',
        insight: $insight,
        reasoning: $reasoning,
        supporting_nodes: $supporting_nodes,
        impact: $impact,
        actionable: $actionable,
        created_at: datetime(),
        updated_at: datetime(),
        accessed_at: datetime(),
        access_count: 0,
        importance: $importance,
        confidence: $confidence,
        embedding: $embedding,
        metadata: $metadata
      })
      RETURN n
    `,
    
    memory: `
      CREATE (n:Memory {
        id: $id,
        type: 'memory',
        memory_type: $memory_type,
        content: $content,
        session_id: $session_id,
        user_id: $user_id,
        decay_rate: $decay_rate,
        reinforcement_count: 0,
        created_at: datetime(),
        updated_at: datetime(),
        accessed_at: datetime(),
        access_count: 0,
        importance: $importance,
        confidence: $confidence,
        embedding: $embedding,
        metadata: $metadata
      })
      RETURN n
    `,

    // Code entity templates
    function: `
      CREATE (n:Function {
        id: $id,
        type: 'function',
        name: $name,
        signature: $signature,
        file_path: $file_path,
        line: $line,
        column: $column,
        end_line: $end_line,
        language: $language,
        documentation: $documentation,
        parameters: $parameters,
        return_type: $return_type,
        visibility: $visibility,
        is_async: $is_async,
        is_static: $is_static,
        complexity: $complexity,
        line_count: $line_count,
        created_at: datetime(),
        updated_at: datetime(),
        accessed_at: datetime(),
        access_count: 0,
        importance: $importance,
        confidence: $confidence,
        embedding: $embedding,
        metadata: $metadata
      })
      RETURN n
    `,

    class: `
      CREATE (n:Class {
        id: $id,
        type: 'class',
        name: $name,
        file_path: $file_path,
        line: $line,
        column: $column,
        end_line: $end_line,
        language: $language,
        documentation: $documentation,
        extends: $extends,
        implements: $implements,
        visibility: $visibility,
        is_abstract: $is_abstract,
        is_final: $is_final,
        methods: $methods,
        properties: $properties,
        constructors: $constructors,
        created_at: datetime(),
        updated_at: datetime(),
        accessed_at: datetime(),
        access_count: 0,
        importance: $importance,
        confidence: $confidence,
        embedding: $embedding,
        metadata: $metadata
      })
      RETURN n
    `,

    interface: `
      CREATE (n:Interface {
        id: $id,
        type: 'interface',
        name: $name,
        file_path: $file_path,
        line: $line,
        column: $column,
        end_line: $end_line,
        language: $language,
        documentation: $documentation,
        extends: $extends,
        methods: $methods,
        properties: $properties,
        created_at: datetime(),
        updated_at: datetime(),
        accessed_at: datetime(),
        access_count: 0,
        importance: $importance,
        confidence: $confidence,
        embedding: $embedding,
        metadata: $metadata
      })
      RETURN n
    `,

    module: `
      CREATE (n:Module {
        id: $id,
        type: 'module',
        name: $name,
        path: $path,
        file_path: $file_path,
        language: $language,
        description: $description,
        exports: $exports,
        imports: $imports,
        dependencies: $dependencies,
        size: $size,
        line_count: $line_count,
        created_at: datetime(),
        updated_at: datetime(),
        accessed_at: datetime(),
        access_count: 0,
        importance: $importance,
        confidence: $confidence,
        embedding: $embedding,
        metadata: $metadata
      })
      RETURN n
    `,

    variable: `
      CREATE (n:Variable {
        id: $id,
        type: 'variable',
        name: $name,
        file_path: $file_path,
        line: $line,
        column: $column,
        language: $language,
        variable_type: $variable_type,
        scope: $scope,
        visibility: $visibility,
        is_constant: $is_constant,
        is_static: $is_static,
        initial_value: $initial_value,
        created_at: datetime(),
        updated_at: datetime(),
        accessed_at: datetime(),
        access_count: 0,
        importance: $importance,
        confidence: $confidence,
        embedding: $embedding,
        metadata: $metadata
      })
      RETURN n
    `,

    type_definition: `
      CREATE (n:Type {
        id: $id,
        type: 'type',
        name: $name,
        file_path: $file_path,
        line: $line,
        column: $column,
        language: $language,
        kind: $kind,
        definition: $definition,
        generic_parameters: $generic_parameters,
        created_at: datetime(),
        updated_at: datetime(),
        accessed_at: datetime(),
        access_count: 0,
        importance: $importance,
        confidence: $confidence,
        embedding: $embedding,
        metadata: $metadata
      })
      RETURN n
    `,
  },

  // Edge templates
  edgeTemplates: {
    createEdge: `
      MATCH (a {id: $source_id})
      MATCH (b {id: $target_id})
      CREATE (a)-[r:$edge_type {
        id: $id,
        type: $edge_type,
        weight: $weight,
        created_at: datetime(),
        updated_at: datetime(),
        metadata: $metadata,
        bidirectional: $bidirectional
      }]->(b)
      RETURN r
    `,
    
    createTemporalEdge: `
      MATCH (a {id: $source_id})
      MATCH (b {id: $target_id})
      CREATE (a)-[r:$edge_type {
        id: $id,
        type: $edge_type,
        weight: $weight,
        created_at: datetime(),
        updated_at: datetime(),
        valid_from: datetime($valid_from),
        valid_to: datetime($valid_to),
        confidence_over_time: $confidence_over_time,
        metadata: $metadata,
        bidirectional: $bidirectional
      }]->(b)
      RETURN r
    `,
  },

  // Common queries
  queries: {
    // Update node access
    updateAccess: `
      MATCH (n {id: $id})
      SET n.accessed_at = datetime(),
          n.access_count = n.access_count + 1
      RETURN n
    `,
    
    // Update node importance
    updateImportance: `
      MATCH (n {id: $id})
      SET n.importance = $importance,
          n.updated_at = datetime()
      RETURN n
    `,
    
    // Decay memory nodes
    decayMemories: `
      MATCH (m:Memory)
      WHERE m.memory_type IN ['short_term', 'working']
        AND datetime() > datetime(m.accessed_at) + duration({seconds: $decay_interval})
      SET m.importance = m.importance * (1 - m.decay_rate),
          m.confidence = m.confidence * (1 - m.decay_rate)
      RETURN m
    `,
    
    // Find related nodes
    findRelated: `
      MATCH (n {id: $id})-[r]-(related)
      WHERE r.weight >= $min_weight
      RETURN related, r
      ORDER BY r.weight DESC
      LIMIT $limit
    `,
    
    // Semantic search
    semanticSearch: `
      CALL db.idx.vector.queryNodes($embedding, $limit, 'embedding_index') 
      YIELD node, similarity
      WHERE similarity >= $threshold
        AND (CASE WHEN $node_types IS NOT NULL 
             THEN node.type IN $node_types 
             ELSE true END)
      RETURN node, similarity
      ORDER BY similarity DESC
    `,
    
    // Find reasoning path
    findPath: `
      MATCH path = shortestPath((start {id: $start_id})-[*..10]-(end {id: $end_id}))
      RETURN path
    `,
    
    // Consolidate memories
    consolidateMemories: `
      MATCH (m:Memory)
      WHERE m.memory_type = 'short_term'
        AND m.reinforcement_count >= $threshold
      SET m.memory_type = 'long_term',
          m.importance = m.importance * 1.5,
          m.updated_at = datetime()
      RETURN m
    `,
    
    // Detect contradictions
    detectContradictions: `
      MATCH (n1:Fact)-[:CONTRADICTS]-(n2:Fact)
      WHERE n1.confidence > $min_confidence
        AND n2.confidence > $min_confidence
      RETURN n1, n2
    `,
    
    // Temporal query
    temporalQuery: `
      MATCH (n)
      WHERE datetime($start) <= n.created_at <= datetime($end)
        AND (CASE WHEN $node_types IS NOT NULL 
             THEN n.type IN $node_types 
             ELSE true END)
      RETURN n
      ORDER BY n.created_at DESC
      LIMIT $limit
    `,
    
    // Multi-hop reasoning
    multiHopReasoning: `
      MATCH path = (start {id: $start_id})-[*1..$max_hops]-(end)
      WHERE ALL(r IN relationships(path) WHERE r.weight >= $min_weight)
        AND end.type IN $target_types
      WITH path, end, 
           reduce(conf = 1.0, r IN relationships(path) | conf * r.weight) AS path_confidence
      WHERE path_confidence >= $min_confidence
      RETURN path, end, path_confidence
      ORDER BY path_confidence DESC
      LIMIT $limit
    `,
    
    // Knowledge graph stats
    getStats: `
      MATCH (n)
      WITH count(n) as total_nodes,
           collect(DISTINCT n.type) as node_types
      MATCH ()-[r]->()
      WITH total_nodes, node_types, count(r) as total_edges,
           collect(DISTINCT type(r)) as edge_types
      RETURN {
        total_nodes: total_nodes,
        total_edges: total_edges,
        node_types: node_types,
        edge_types: edge_types,
        avg_connections: toFloat(total_edges) / total_nodes,
        density: toFloat(total_edges) / (total_nodes * (total_nodes - 1))
      } as stats
    `,

    // Code-specific queries
    findFunctionsByName: `
      MATCH (f:Function)
      WHERE f.name CONTAINS $name
      RETURN f
      ORDER BY f.importance DESC
      LIMIT $limit
    `,

    findClassHierarchy: `
      MATCH (c:Class {id: $class_id})-[:EXTENDS*0..5]-(related:Class)
      RETURN related, length(()-[:EXTENDS*]-(related)) as depth
      ORDER BY depth
    `,

    findFunctionCalls: `
      MATCH (f:Function {id: $function_id})-[:CALLS]->(called:Function)
      RETURN called, f
      ORDER BY called.name
    `,

    findCallers: `
      MATCH (caller:Function)-[:CALLS]->(f:Function {id: $function_id})
      RETURN caller
      ORDER BY caller.importance DESC
    `,

    findModuleDependencies: `
      MATCH (m:Module {id: $module_id})-[:IMPORTS]->(dep:Module)
      RETURN dep, m
      ORDER BY dep.name
    `,

    findSimilarFunctions: `
      MATCH (f:Function)
      WHERE f.complexity >= $min_complexity 
        AND f.complexity <= $max_complexity
        AND f.language = $language
        AND f.id <> $function_id
      RETURN f
      ORDER BY f.similarity DESC
      LIMIT $limit
    `,

    getCodeMetrics: `
      MATCH (f:Function)
      WITH count(f) as total_functions,
           avg(f.complexity) as avg_complexity,
           max(f.complexity) as max_complexity,
           sum(f.line_count) as total_lines
      MATCH (c:Class)
      WITH total_functions, avg_complexity, max_complexity, total_lines,
           count(c) as total_classes
      MATCH (m:Module)
      RETURN {
        total_functions: total_functions,
        total_classes: total_classes,
        total_modules: count(m),
        avg_complexity: avg_complexity,
        max_complexity: max_complexity,
        total_lines: total_lines
      } as metrics
    `,

    findCyclicDependencies: `
      MATCH path = (m1:Module)-[:IMPORTS*2..10]->(m1)
      WHERE length(path) > 2
      RETURN nodes(path) as cycle, length(path) as cycle_length
      ORDER BY cycle_length
      LIMIT 20
    `,

    findUnusedFunctions: `
      MATCH (f:Function)
      WHERE NOT (f)<-[:CALLS]-()
        AND f.visibility <> 'private'
      RETURN f
      ORDER BY f.created_at DESC
    `,

    findHighComplexityFunctions: `
      MATCH (f:Function)
      WHERE f.complexity > $threshold
      RETURN f
      ORDER BY f.complexity DESC
      LIMIT $limit
    `,

    findCodeDuplication: `
      MATCH (f1:Function), (f2:Function)
      WHERE f1.signature = f2.signature
        AND f1.id <> f2.id
        AND f1.file_path <> f2.file_path
      RETURN f1, f2
      ORDER BY f1.line_count DESC
    `,

    getFileAnalysis: `
      MATCH (n)
      WHERE n.file_path = $file_path
      OPTIONAL MATCH (n)-[r]->(related)
      RETURN n, collect({relationship: r, target: related}) as relationships
      ORDER BY n.line
    `,

    findInterfaceImplementations: `
      MATCH (c:Class)-[:IMPLEMENTS]->(i:Interface {id: $interface_id})
      RETURN c
      ORDER BY c.name
    `,

    findOverriddenMethods: `
      MATCH (child:Class)-[:EXTENDS]->(parent:Class)
      MATCH (child)-[:DEFINES]->(m1:Function)
      MATCH (parent)-[:DEFINES]->(m2:Function)
      WHERE m1.name = m2.name
        AND m1.signature = m2.signature
      RETURN child, parent, m1, m2
    `,

    findTechnicalDebt: `
      MATCH (f:Function)
      WHERE f.complexity > $complexity_threshold
         OR f.line_count > $line_threshold
      WITH f, 
           (CASE WHEN f.complexity > $complexity_threshold THEN 1 ELSE 0 END) +
           (CASE WHEN f.line_count > $line_threshold THEN 1 ELSE 0 END) as debt_score
      RETURN f, debt_score
      ORDER BY debt_score DESC, f.complexity DESC
      LIMIT $limit
    `,
  },
};