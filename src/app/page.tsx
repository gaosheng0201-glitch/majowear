'use client'

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PlusCircle, Scissors, Palette, LayoutGrid, LogOut, Loader2, Folder, Globe } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useStudioStore } from "@/lib/store"
import { translations } from "@/lib/translations"

export default function Dashboard() {
  const router = useRouter()
  const supabase = createClient()
  
  const { projects, setProjects, addProject, language, setLanguage } = useStudioStore()
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [projectName, setProjectName] = useState("")
  const [projectDesc, setProjectDesc] = useState("")
  const [createLoading, setCreateLoading] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  const t = translations[language]

  useEffect(() => {
    async function fetchUserDataAndProjects() {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          router.push('/login')
          return
        }
        setUserEmail(user.email || null)

        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .order('updated_at', { ascending: false })

        if (error) throw error
        setProjects(data || [])
      } catch (err) {
        console.error("Error loading dashboard data:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchUserDataAndProjects()
  }, [supabase, router, setProjects])

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectName.trim()) return

    setCreateLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Choose a random gradient for project cover image if not provided
      const gradients = [
        "from-pink-500 to-rose-500",
        "from-purple-600 to-indigo-600",
        "from-cyan-500 to-blue-500",
        "from-emerald-500 to-teal-600",
        "from-amber-500 to-orange-600",
      ]
      const randomGradient = gradients[Math.floor(Math.random() * gradients.length)]

      const { data, error } = await supabase
        .from('projects')
        .insert({
          name: projectName,
          description: projectDesc,
          user_id: user.id,
          cover_image: randomGradient
        })
        .select()
        .single()

      if (error) throw error

      if (data) {
        addProject(data)
        setIsModalOpen(false)
        setProjectName("")
        setProjectDesc("")
        // Redirect to new project workspace
        router.push(`/projects/${data.id}`)
      }
    } catch (err) {
      console.error("Failed to create project:", err)
    } finally {
      setCreateLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <header className="sticky top-0 z-10 backdrop-blur-md bg-background/80 border-b border-border px-6 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <Scissors className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-outfit font-semibold tracking-tight">
            {t.title}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {userEmail && (
            <span className="text-xs text-muted-foreground hidden sm:inline-block">
              {userEmail}
            </span>
          )}
          {/* Language Switcher */}
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
            className="flex items-center gap-1"
          >
            <Globe className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">
              {language === 'zh' ? 'EN' : '中文'}
            </span>
          </Button>

          <Button variant="outline" size="sm" onClick={() => router.push('/')}>
            <LayoutGrid className="w-4 h-4 mr-2" />
            {t.projects}
          </Button>
          <Button size="sm" onClick={() => setIsModalOpen(true)}>
            <PlusCircle className="w-4 h-4 mr-2" />
            {t.newProject}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full">
        <section className="mb-12">
          <h2 className="text-3xl font-outfit font-bold mb-2">{t.welcome}</h2>
          <p className="text-muted-foreground">{t.welcomeSub}</p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Quick Action Cards */}
          <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:shadow-lg hover:-translate-y-1">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <Palette className="w-8 h-8 mb-4 text-primary" />
            <h3 className="text-xl font-semibold mb-2">{t.styleDna}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t.styleDnaDesc}
            </p>
            <Button variant="secondary" className="w-full" onClick={() => setIsModalOpen(true)}>
              {language === 'zh' ? '请先创建一个项目' : 'Create a Project first'}
            </Button>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:shadow-lg hover:-translate-y-1">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="w-8 h-8 mb-4 flex items-center justify-center rounded-lg bg-blue-500/20 text-blue-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 14 6-6 4 4 10-10"/><path d="M12 2v20"/></svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">{t.fabricLibrary}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t.fabricDesc}
            </p>
            <Button variant="secondary" className="w-full" onClick={() => setIsModalOpen(true)}>
              {language === 'zh' ? '请先创建一个项目' : 'Create a Project first'}
            </Button>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:shadow-lg hover:-translate-y-1">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <LayoutGrid className="w-8 h-8 mb-4 text-green-500" />
            <h3 className="text-xl font-semibold mb-2">{t.collections}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t.collectionsDesc}
            </p>
            <Button variant="secondary" className="w-full" onClick={() => setIsModalOpen(true)}>
              {language === 'zh' ? '请先创建一个项目' : 'Create a Project first'}
            </Button>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-outfit font-semibold">{t.recentProjects}</h3>
          </div>
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-border rounded-2xl">
              <Folder className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h4 className="font-semibold text-lg mb-1">{t.noProjects}</h4>
              <p className="text-muted-foreground text-sm mb-4">{t.noProjectsSub}</p>
              <Button onClick={() => setIsModalOpen(true)}>
                <PlusCircle className="w-4 h-4 mr-2" />
                {t.newProject}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {projects.map((project) => (
                <div 
                  key={project.id}
                  onClick={() => router.push(`/projects/${project.id}`)}
                  className="group rounded-xl border border-border bg-card overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer flex flex-col animate-in fade-in-30 duration-300"
                >
                  <div className={`aspect-video bg-gradient-to-br ${project.cover_image || 'from-neutral-700 to-neutral-900'} flex items-center justify-center text-white font-outfit font-semibold text-lg relative overflow-hidden`}>
                    <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
                    <span className="z-10 drop-shadow-md truncate px-4">{project.name}</span>
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="font-semibold text-base line-clamp-1 group-hover:text-primary transition-colors">{project.name}</h4>
                      {project.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{project.description}</p>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-3">
                      {t.created} {new Date(project.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* New Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300">
          <div className="w-full max-w-md bg-card border border-border rounded-xl p-6 shadow-2xl relative animate-in fade-in-50 zoom-in-95 duration-200">
            <h3 className="text-xl font-outfit font-bold mb-4">{t.createProjectTitle}</h3>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="projectName">{t.projectName}</Label>
                <Input
                  id="projectName"
                  placeholder="e.g. 2026 Spring Urban Outdoor"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  required
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="projectDesc">{t.projectDesc}</Label>
                <Input
                  id="projectDesc"
                  placeholder="Describe the aesthetic direction, client, or season..."
                  value={projectDesc}
                  onChange={(e) => setProjectDesc(e.target.value)}
                  className="bg-muted/50"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsModalOpen(false)}
                  disabled={createLoading}
                >
                  {t.cancel}
                </Button>
                <Button type="submit" disabled={createLoading}>
                  {createLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <span>{t.create}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
