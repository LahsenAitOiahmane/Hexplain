import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// Create styles for the PDF
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#334155',
    backgroundColor: '#ffffff'
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: '#4f46e5',
    paddingBottom: 15,
    marginBottom: 20
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 5
  },
  subtitle: {
    fontSize: 10,
    color: '#64748b',
    marginBottom: 4
  },
  section: {
    marginBottom: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    padding: 15
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 4,
    marginBottom: 10
  },
  row: {
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'flex-start'
  },
  label: {
    width: 100,
    fontWeight: 'bold',
    color: '#475569'
  },
  value: {
    flex: 1,
    color: '#334155'
  },
  riskBadge: {
    padding: '3px 6px',
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    borderRadius: 3,
    fontWeight: 'bold',
    alignSelf: 'flex-start'
  },
  riskBox: {
    padding: 10,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 4,
    marginBottom: 10
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  itemBlock: {
    backgroundColor: '#f8fafc',
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4
  },
  itemTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 3
  },
  itemText: {
    color: '#475569',
    lineHeight: 1.4
  },
  codeBlock: {
    backgroundColor: '#f1f5f9',
    padding: 8,
    marginTop: 5,
    fontFamily: 'Courier',
    fontSize: 8,
    color: '#334155',
    borderRadius: 3
  }
});

const stripMarkdown = (str: string) => {
  if (!str) return "";
  return str
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
    .replace(/(\*|_)(.*?)\1/g, '$2') // italic
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // links
    .replace(/#+\s?(.*)/g, '$1') // headers
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/^\s*-\s+/gm, '• ') // bullet points
    .replace(/^\s*\d+\.\s+/gm, '• ') // numbered lists
    .trim();
};

interface PdfReportProps {
  job: any;
  report: any;
}

export const PdfReport = ({ job, report }: PdfReportProps) => {
  const repData = report?.report_data || {};
  const isCritical = report?.risk_level === "critical" || report?.risk_level === "high";

  // Filter functions for the PDF
  const funcs = repData.decompilation?.functions || [];
  const keyFunctions = funcs.filter((f: any) => {
    const n = (f.name || "").toLowerCase();
    return n.includes("main") || n.includes("start") || n.includes("entry") || isCritical;
  }).slice(0, 5); // Limit to top 5 to prevent massive PDFs

  return (
    <Document>
      {/* Page 1: Executive Summary & Risk */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>MalwAIre Analysis Report</Text>
          <Text style={styles.subtitle}>File: {job?.file_name}</Text>
          <Text style={styles.subtitle}>SHA-256: {job?.file_hash_sha256}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Executive Summary</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Risk Score:</Text>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontWeight: 'bold', marginRight: 10 }}>{report?.risk_score}/100</Text>
              <Text style={styles.riskBadge}>{report?.risk_level?.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={{ marginTop: 10, lineHeight: 1.5 }}>
            {stripMarkdown(report?.summary || "No executive summary available.")}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Risk Breakdown</Text>
          <View style={styles.riskBox}>
            {(repData.risk_assessment?.breakdown || []).map((item: any, i: number) => (
              <View key={i} style={styles.breakdownRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={{ fontWeight: 'bold', marginBottom: 2 }}>{item.signal.replace(/_/g, ' ')}</Text>
                  <Text style={{ fontSize: 9, color: '#64748b' }}>{stripMarkdown(item.detail)}</Text>
                </View>
                <Text style={{ fontWeight: 'bold', color: '#b45309' }}>+{item.points} pt</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Threat Intel & Capabilities</Text>
          
          <View style={{ marginBottom: 10 }}>
            <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>AI Enriched Intelligence:</Text>
            <Text style={{ lineHeight: 1.4 }}>
              {stripMarkdown(repData.threat_intel?.ai_enriched?.summary || "No AI enriched threat intelligence available.")}
            </Text>
          </View>

          <View>
            <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Identified Capabilities (Capa):</Text>
            {(repData.capa?.capabilities || repData.capa?.matches || []).length > 0 ? (
              (repData.capa?.capabilities || repData.capa?.matches || []).map((m: any, i: number) => (
                <Text key={i} style={{ marginBottom: 4, color: '#475569' }}>• {m.name || m.rule}</Text>
              ))
            ) : (
              <Text style={{ color: '#94a3b8', fontStyle: 'italic' }}>No capabilities identified.</Text>
            )}
          </View>
        </View>
      </Page>

      {/* Page 2: Binary Details & Code */}
      <Page size="A4" style={styles.page}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Binary Sections</Text>
          {(repData.structural?.sections || []).length > 0 ? (
            (repData.structural?.sections || []).map((sec: any, i: number) => (
              <View key={i} style={styles.itemBlock}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={styles.itemTitle}>{sec.name || "<unnamed>"}</Text>
                  <Text style={{ fontSize: 9, fontWeight: 'bold', color: sec.entropy > 7.0 ? '#dc2626' : '#64748b' }}>
                    Entropy: {sec.entropy?.toFixed(2)} {sec.entropy > 7.0 ? "(Packed)" : ""}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={{ color: '#94a3b8', fontStyle: 'italic' }}>No structural sections available.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key Functions (Entry Point & Malicious Context)</Text>
          <Text style={{ fontSize: 9, color: '#64748b', marginBottom: 10 }}>
            Note: To preserve document readability, only primary entry points and explicitly flagged malicious functions are included. Generic assembly dumps are excluded.
          </Text>
          
          {keyFunctions.length > 0 ? (
            keyFunctions.map((f: any, i: number) => (
              <View key={i} style={styles.itemBlock}>
                <Text style={styles.itemTitle}>{f.name}</Text>
                <Text style={styles.itemText}>Pipeline: {f.pipeline} | Lines: {f.line_count || 0}</Text>
                {f.decompiled && f.decompiled.trim() !== "" ? (
                   <View style={styles.codeBlock}>
                     <Text>{f.decompiled.substring(0, 1500)}{f.decompiled.length > 1500 ? "\n// ... [truncated for PDF export]" : ""}</Text>
                   </View>
                ) : null}
              </View>
            ))
          ) : (
            <Text style={{ color: '#94a3b8', fontStyle: 'italic' }}>No critical functions identified for export.</Text>
          )}
        </View>
      </Page>
    </Document>
  );
};
