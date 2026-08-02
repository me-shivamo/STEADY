import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppStackParamList } from './types';
import HomeScreen from '../screens/app/HomeScreen';
import WeightScreen from '../screens/app/WeightScreen';
import WaterScreen from '../screens/app/WaterScreen';
import BodyMeasurementsScreen from '../screens/app/BodyMeasurementsScreen';
import ProgressScreen from '../screens/app/ProgressScreen';
import SettingsScreen from '../screens/app/SettingsScreen';
import RemindersScreen from '../screens/app/RemindersScreen';
import ReminderDetailScreen from '../screens/app/ReminderDetailScreen';
import AdjustMacrosScreen from '../screens/app/AdjustMacrosScreen';
import GroupsIntroScreen from '../screens/app/GroupsIntroScreen';
import GroupCreateScreen from '../screens/app/GroupCreateScreen';
import GroupInviteScreen from '../screens/app/GroupInviteScreen';
import GroupJoinScreen from '../screens/app/GroupJoinScreen';
import GroupHomeScreen from '../screens/app/GroupHomeScreen';

// ── App stack — Home at the root, full-screen push screens on top ─────────────
// The old bottom-tab navigator is gone: after Journal was cut and the Me tab
// turned out to be unreachable (Home hid the tab bar, so it could never be
// tapped), Home was the only real tab left — profile already lives in the
// slide-out drawer. Think of the stack as a pile of cards with Home as the
// bottom card; navigate('Weight') slides a new card on top, back pops it off.
const Stack = createNativeStackNavigator<AppStackParamList>();

export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home"             component={HomeScreen} />
      <Stack.Screen name="Weight"           component={WeightScreen} />
      <Stack.Screen name="Water"            component={WaterScreen} />
      <Stack.Screen name="BodyMeasurements" component={BodyMeasurementsScreen} />
      <Stack.Screen name="Progress"         component={ProgressScreen} />
      <Stack.Screen name="Settings"         component={SettingsScreen} />
      <Stack.Screen name="Reminders"        component={RemindersScreen} />
      <Stack.Screen name="ReminderDetail"   component={ReminderDetailScreen} />
      <Stack.Screen name="AdjustMacros"     component={AdjustMacrosScreen} />
      <Stack.Screen name="GroupsIntro"      component={GroupsIntroScreen} />
      <Stack.Screen name="GroupCreate"      component={GroupCreateScreen} />
      <Stack.Screen name="GroupInvite"      component={GroupInviteScreen} />
      <Stack.Screen name="GroupJoin"        component={GroupJoinScreen} />
      <Stack.Screen name="GroupHome"        component={GroupHomeScreen} />
    </Stack.Navigator>
  );
}
