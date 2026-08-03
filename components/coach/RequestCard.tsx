import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../lib/theme';
import { BookingRequest } from '../../mock/coachFlow';
import InitialAvatar from '../shared/InitialAvatar';
import CountdownPill from './CountdownPill';

export default function RequestCard({
  request,
  onAccept,
  onReject,
}: {
  request: BookingRequest;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <InitialAvatar initial={request.playerInitial} size={44} />
        <View style={styles.info}>
          <Text style={styles.playerName}>{request.playerName}</Text>
          <Text style={styles.meta}>{request.category}</Text>
          <Text style={styles.parentName}>Solicita {request.parentName}</Text>
        </View>
        <CountdownPill initialSeconds={request.expiresInSeconds} />
      </View>

      <View style={styles.detailsBlock}>
        <Text style={styles.metaLine}>
          {request.date} · {request.time}
        </Text>
        <Text style={styles.metaLine}>{request.venue}</Text>
        {request.note ? <Text style={styles.note}>“{request.note}”</Text> : null}
      </View>

      <View style={styles.actionsRow}>
        <Pressable style={styles.rejectButton} onPress={onReject}>
          <Text style={styles.rejectLabel}>Rechazar</Text>
        </Pressable>
        <Pressable style={styles.acceptButton} onPress={onAccept}>
          <Text style={styles.acceptLabel}>Aceptar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  info: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  playerName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  meta: {
    color: colors.textSoft,
    fontSize: 12,
    marginBottom: 2,
  },
  parentName: {
    color: colors.textDim,
    fontSize: 11,
  },
  detailsBlock: {
    marginTop: 14,
    marginBottom: 16,
    gap: 3,
  },
  metaLine: {
    color: colors.textSoft,
    fontSize: 13,
  },
  note: {
    color: colors.textDim,
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 17,
    marginTop: 6,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  rejectButton: {
    flex: 1,
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.errorCoral,
    paddingVertical: 15,
    alignItems: 'center',
  },
  rejectLabel: {
    color: colors.errorCoral,
    fontSize: 14,
    fontWeight: '800',
  },
  acceptButton: {
    flex: 1,
    borderRadius: radius,
    backgroundColor: colors.ballLime,
    paddingVertical: 15,
    alignItems: 'center',
  },
  acceptLabel: {
    color: colors.courtBlueDeep,
    fontSize: 14,
    fontWeight: '800',
  },
});
