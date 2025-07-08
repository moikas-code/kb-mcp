/**
 * Graph Schema Definitions
 * Cypher queries and indexes for FalkorDB
 */

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
    
    // Create property indexes for fast lookups
    'CREATE INDEX ON :Concept(name)',
    'CREATE INDEX ON :Entity(name)',
    'CREATE INDEX ON :Document(path)',
    'CREATE INDEX ON :Event(timestamp)',
    'CREATE INDEX ON :Memory(session_id)',
    'CREATE INDEX ON :Memory(user_id)',
    
    // Full-text search indexes
    'CREATE FULLTEXT INDEX conceptSearch ON :Concept(name, description)',
    'CREATE FULLTEXT INDEX factSearch ON :Fact(statement)',
    'CREATE FULLTEXT INDEX documentSearch ON :Document(title, content)',
    'CREATE FULLTEXT INDEX entitySearch ON :Entity(name, aliases)',
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
  },
};