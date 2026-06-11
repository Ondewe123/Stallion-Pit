import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const VehicleContext = createContext({})

export function VehicleProvider({ children }) {
  const [vehicles, setVehicles] = useState([])
  const [activeVehicle, setActiveVehicle] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchVehicles()
  }, [])

  const fetchVehicles = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true })

    if (!error && data) {
      setVehicles(data)
      // Restore last active vehicle from localStorage
      const savedId = localStorage.getItem('stallion_active_vehicle')
      const saved = data.find(v => v.id === savedId)
      setActiveVehicle(saved || data[0] || null)
    }
    setLoading(false)
  }

  const selectVehicle = (vehicle) => {
    setActiveVehicle(vehicle)
    localStorage.setItem('stallion_active_vehicle', vehicle.id)
  }

  const refreshVehicles = () => fetchVehicles()

  return (
    <VehicleContext.Provider value={{
      vehicles,
      activeVehicle,
      selectVehicle,
      refreshVehicles,
      loading
    }}>
      {children}
    </VehicleContext.Provider>
  )
}

export const useVehicle = () => useContext(VehicleContext)
